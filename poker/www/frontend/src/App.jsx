import { useCallback, useEffect, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { useGameSocket } from './hooks/useGameSocket';
import { useResultPhase } from './hooks/useResultPhase';
import { JoinScreen } from './components/JoinScreen';
import { GameArea } from './components/GameArea';
import { RoundResultModal } from './components/RoundResultModal';
import { FinalResultModal } from './components/FinalResultModal';
import { getHandName } from './utils/handEvaluator';
import { runViewTransition } from './components/navigationTransition';


const MAX_ROUNDS = 5;

export default function App() {
  const [phase, setPhase] = useState('join'); // join | searching | game
  const [searchMode, setSearchMode] = useState(null); // searching中のみ 'room' | 'random'
  const [roomId, setRoomId] = useState('');
  const [yourName, setYourName] = useState('');
  const [opponentName, setOpponentName] = useState('');
  const [yourCards, setYourCards] = useState([]);
  const [opponentCards, setOpponentCards] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState({ win: 0, loss: 0, draw: 0 });
  const [roundMessage, setRoundMessage] = useState(null);
  const [showFinal, setShowFinal] = useState(false);
  const [waitingForNextRound, setWaitingForNextRound] = useState(false);
  const [lastOutcome, setLastOutcome] = useState(null); // 直近ラウンドの結果 ('win' | 'loss' | 'draw')
  const [destroyEffectTrigger, setDestroyEffectTrigger] = useState(0);
  const [pendingDestroyEffect, setPendingDestroyEffect] = useState(false);

  const localPlayerNameRef = useRef('');
  // handleMessage は依存配列が空なので、最新の phase を ref で参照する
  const phaseRef = useRef(phase);
  phaseRef.current = phase;
  const showFinalRef = useRef(showFinal);
  showFinalRef.current = showFinal;
  // 切断系の通知(opponent_left / connection_closed)は重複して届くことがあるので1回だけ処理する
  const leavingRef = useRef(false);

  const resultPhase = useResultPhase(roundMessage !== null, opponentCards.length);
  const yourPlayedCards = yourCards.filter((_, i) => selectedIndices.has(i));
  const showYourHand = resultPhase === 'yourHand' || resultPhase === 'opponentHand' || resultPhase === 'modal';
  const showOpponentHand = resultPhase === 'opponentHand' || resultPhase === 'modal';

  // 結果モーダルが実際に表示されるタイミング(演出完了後)まで紙吹雪を遅らせる
  useEffect(() => {
    if (resultPhase === 'modal' && lastOutcome === 'win') {
      confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
    }
  }, [resultPhase, lastOutcome]);

  // destroy_opponent_cardsの破壊演出は、相手カードのフリップ(公開)が終わった直後に発火させる
  useEffect(() => {
    if (pendingDestroyEffect && resultPhase === 'yourHand') {
      setDestroyEffectTrigger((t) => t + 1);
      setPendingDestroyEffect(false);
    }
  }, [resultPhase, pendingDestroyEffect]);

  const handleMessage = useCallback((message) => {
    switch (message.type) {
      case 'error':
        alert(message.message);
        // 参加に失敗した場合は入力画面に戻す
        if (phaseRef.current === 'searching') {
          setPhase('join');
          setSearchMode(null);
        }
        return;

      case 'queue.left':
        setPhase('join');
        setSearchMode(null);
        return;

      case 'opponent_left':
      case 'connection_closed': {
        // 最終結果を表示済みなら、その後の切断は案内しない
        if (leavingRef.current || showFinalRef.current) return;
        leavingRef.current = true;
        alert(
          message.type === 'opponent_left'
            ? '対戦相手が切断しました。最初の画面に戻ります。'
            : 'サーバーとの接続が切れました。最初の画面に戻ります。'
        );
        // 接続・ゲーム状態をまとめて初期化するため再読み込みする
        location.reload();
        return;
      }

      case 'match_found':
        // この直後に'cards'が届き、画面遷移の演出とともにゲーム画面へ切り替わる
        setRoomId(message.room_id);
        return;

      case 'cards': {
        const applyCards = () => {
          setYourCards(message.cards);
          setOpponentCards([]);
          setSelectedIndices(new Set());
          setConfirmed(false);
          setPhase('game');
          setWaitingForNextRound(false);
          // サーバーは次ラウンドへの遷移時(手札配布時)にラウンド数を進めて送ってくる
          if (message.round) setRound(message.round);
          if (message.opponent_name) setOpponentName(message.opponent_name);
          setRoundMessage(null); // 新しい手札が届いたので結果モーダルを閉じる
        };

        runViewTransition(applyCards);
        
        return;
      }

      case 'update':
        setOpponentCards(message.opponent);
        if (message.effect === 'destroy_opponent_cards') {
          setPendingDestroyEffect(true);
        }
        return;

      case 'result': {
        const resultMessage = message.result;
        if (resultMessage.includes('Draw')) {
          setScore((s) => ({ ...s, draw: s.draw + 1 }));
          setLastOutcome('draw');
        } else if (resultMessage.includes(localPlayerNameRef.current)) {
          setScore((s) => ({ ...s, win: s.win + 1 }));
          setLastOutcome('win');
        } else {
          setScore((s) => ({ ...s, loss: s.loss + 1 }));
          setLastOutcome('loss');
        }

        // message.round は今終わったラウンドの番号
        if (message.round >= MAX_ROUNDS) {
          setShowFinal(true);
        } else {
          setRoundMessage(resultMessage);
        }
        return;
      }

      default:
        return;
    }
  }, []);

  const send = useGameSocket(handleMessage);

  const handleJoin = (inputRoomId, name) => {
    localPlayerNameRef.current = name;
    setYourName(name);
    send({ type: 'join', room_id: inputRoomId, name });
    setRoomId(inputRoomId);
    setPhase('searching');
    setSearchMode('room');
  };

  const handleRandomMatch = (name) => {
    localPlayerNameRef.current = name;
    setYourName(name);
    send({ type: 'queue.join', name });
    setPhase('searching');
    setSearchMode('random');
  };

  // キャンセル完了はサーバーからの'queue.left'で画面に反映する(行き違いで成立済みならそのままゲーム開始)
  const handleCancelMatch = () => {
    send({ type: 'queue.leave' });
  };

  const toggleCard = (index) => {
    setSelectedIndices((prev) => {
      const next = new Set(prev);
      if (next.has(index)) {
        next.delete(index);
      } else if (next.size < 5) {
        next.add(index);
      }
      return next;
    });
  };

  const handleConfirm = () => {
    const selected = yourCards.filter((_, i) => selectedIndices.has(i));
    send({ type: 'ready', selected });
    setConfirmed(true);
  };

  const handleNextRound = () => {
    setWaitingForNextRound(true);
    setYourCards((prev) => prev.filter((_, i) => !selectedIndices.has(i)));
    setOpponentCards([]);
    setSelectedIndices(new Set());
    setConfirmed(false);
    send({ type: 'restart' });
  };

  return (
    <>
      {phase !== 'game' && (
        <JoinScreen
          searching={phase === 'searching' ? searchMode : null}
          onJoin={handleJoin}
          onRandomMatch={handleRandomMatch}
          onCancelMatch={handleCancelMatch}
        />
      )}

      {phase === 'game' && (
        <GameArea
          roomId={roomId}
          round={round}
          yourName={yourName}
          opponentName={opponentName}
          yourCards={yourCards}
          opponentCards={opponentCards}
          selectedIndices={selectedIndices}
          onToggleCard={toggleCard}
          onConfirm={handleConfirm}
          confirmDisabled={confirmed || selectedIndices.size !== 5}
          yourHandName={showYourHand ? getHandName(yourPlayedCards) : null}
          opponentHandName={showOpponentHand ? getHandName(opponentCards) : null}
          destroyEffectTrigger={destroyEffectTrigger}
        />
      )}

      {resultPhase === 'modal' && (
        <RoundResultModal
          message={roundMessage}
          onNext={handleNextRound}
          nextDisabled={waitingForNextRound}
        />
      )}

      {showFinal && (
        <FinalResultModal
          winCount={score.win}
          lossCount={score.loss}
          drawCount={score.draw}
        />
      )}

      {/* マッチング成立時の画面遷移用の幕(通常時は画面外に待機) */}
      <div id="stage-curtain" aria-hidden="true" />
    </>
  );
}
