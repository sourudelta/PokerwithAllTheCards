import { useCallback, useRef, useState } from 'react';
import confetti from 'canvas-confetti';
import { useGameSocket } from './hooks/useGameSocket';
import { JoinScreen } from './components/JoinScreen';
import { GameArea } from './components/GameArea';
import { RoundResultModal } from './components/RoundResultModal';
import { FinalResultModal } from './components/FinalResultModal';

const MAX_ROUNDS = 5;

export default function App() {
  const [phase, setPhase] = useState('join'); // join | searching | game
  const [yourCards, setYourCards] = useState([]);
  const [opponentCards, setOpponentCards] = useState([]);
  const [selectedIndices, setSelectedIndices] = useState(new Set());
  const [confirmed, setConfirmed] = useState(false);
  const [round, setRound] = useState(1);
  const [score, setScore] = useState({ win: 0, loss: 0, draw: 0 });
  const [roundMessage, setRoundMessage] = useState(null);
  const [showFinal, setShowFinal] = useState(false);

  const localPlayerNameRef = useRef('');

  const handleMessage = useCallback((message) => {
    switch (message.type) {
      case 'error':
        alert(message.message);
        return;

      case 'cards':
        setYourCards(message.cards);
        setOpponentCards([]);
        setSelectedIndices(new Set());
        setConfirmed(false);
        setPhase('game');
        return;

      case 'update':
        setOpponentCards(message.opponent);
        return;

      case 'result': {
        const resultMessage = message.result;
        if (resultMessage.includes('Draw')) {
          setScore((s) => ({ ...s, draw: s.draw + 1 }));
        } else if (resultMessage.includes(localPlayerNameRef.current)) {
          setScore((s) => ({ ...s, win: s.win + 1 }));
          confetti({ particleCount: 100, spread: 70, origin: { y: 0.6 } });
        } else {
          setScore((s) => ({ ...s, loss: s.loss + 1 }));
        }

        setRound(message.round);
        if (message.round > MAX_ROUNDS) {
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

  const handleJoin = (roomId, name) => {
    localPlayerNameRef.current = name;
    send({ type: 'join', room_id: roomId, name });
    setPhase('searching');
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
    setRoundMessage(null);
    setYourCards([]);
    setOpponentCards([]);
    setSelectedIndices(new Set());
    setConfirmed(false);
    send({ type: 'restart' });
  };

  return (
    <>
      {phase !== 'game' && (
        <JoinScreen searching={phase === 'searching'} onJoin={handleJoin} />
      )}

      {phase === 'game' && (
        <GameArea
          round={round}
          yourCards={yourCards}
          opponentCards={opponentCards}
          selectedIndices={selectedIndices}
          onToggleCard={toggleCard}
          onConfirm={handleConfirm}
          confirmDisabled={confirmed || selectedIndices.size !== 5}
        />
      )}

      {roundMessage !== null && (
        <RoundResultModal message={roundMessage} onNext={handleNextRound} />
      )}

      {showFinal && (
        <FinalResultModal
          winCount={score.win}
          lossCount={score.loss}
          drawCount={score.draw}
        />
      )}
    </>
  );
}
