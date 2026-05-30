// モーダルを動的に読み込む
fetch("html/result_modal.html")
    .then(res => res.text())
    .then(html => { document.body.insertAdjacentHTML("beforeend", html); });

fetch("html/round_result_modal.html")
    .then(res => res.text())
    .then(html => {
        document.body.insertAdjacentHTML("beforeend", html);
        document.getElementById("restart-button").addEventListener("click", () => {
            document.getElementById("round-result-modal").style.display = "none";
            resetGameState();
        });
    });

// 本番・ローカル両対応のWebSocket URL生成
const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
const wsHost = location.host;
const socket = new WebSocket(`${wsProtocol}//${wsHost}/ws`);

let yourCards = []; // サーバーから送られる自分のカード
let selectedCards = []; // プレイヤーが選択したカード
let localPlayerName = ""; // 自分のプレイヤー名

let winCount = 0;
let lossCount = 0;
let drawCount = 0;


const SpecialCard = [
    { effect: "相手のカードを全て破壊" },
    { effect: "相手の特殊カードを無効にする" },
    { effect: "相手の手札上限を１減らす" },
];

const MAX_ROUNDS = 5; 

// サーバーからのメッセージを受信
socket.onmessage = (event) => {
    
    const message = JSON.parse(event.data);
    console.log("Received message:", message); // 受信データを確認

    if (message.type === "error") {
        alert(message.message);
        return;
    }

    if (message.type === "joined") {
        // 参加成功時にのみ画面を切り替える
        const joinBtn = document.getElementById("joinButton");
        if (joinBtn) joinBtn.style.display = "none";
        const joinDiv = document.getElementById("join");
        if (joinDiv) joinDiv.style.display = "none";
        const statsDiv = document.getElementById("game-stats");
        if (statsDiv) statsDiv.style.display = "block";
    }

    if (message.type === "cards") {
        // サーバーから受け取ったカードを表示
        yourCards = message.cards;
        renderYourCards();
    }

    if (message.type === "update") {
        // 相手の選択したカードを更新
        const opponentCardsContainer = document.getElementById("opponent-cards");
        opponentCardsContainer.innerHTML = "";

        message.opponent.forEach(card => {
            const cardDiv = document.createElement("div");
            cardDiv.className = "card animate";
    
            const baseURL = `${location.protocol}//${location.host}/`;
            const cardImage = document.createElement("img");
            cardImage.src = `${baseURL}${card.image}`; // サーバーから送られた画像URLを使用
            cardImage.alt = `${card.Value} of ${card.Suit}`;
            cardImage.className = "card-image";
    
            cardDiv.appendChild(cardImage);
            opponentCardsContainer.appendChild(cardDiv);
        });

    }

    if (message.type === "result") {
        // ゲーム結果の受信
        const resultMessage = message.result;
        
        // 勝敗数を記録 (メッセージの内容に基づいて判定)
        if (resultMessage.includes("Draw")) {
            drawCount++;
        } else if (resultMessage.includes(localPlayerName)) {
            winCount++;
            // ラウンド勝利の紙吹雪
            confetti({
                particleCount: 100,
                spread: 70,
                origin: { y: 0.6 }
            });
        } else {
            lossCount++;
        }

        // ラウンド数を更新
        const roundCount = document.getElementById("round-count");
        roundCount.textContent = message.round;

        if (message.round > MAX_ROUNDS) {
            showFinalResult();
        } else {
            // ラウンド結果モーダルを表示
            document.getElementById("result-message").textContent = resultMessage;
            document.getElementById("round-result-modal").style.display = "flex";
        }
    }
};

// 自分のカードを表示
function renderYourCards() {
    const yourCardsContainer = document.getElementById("your-cards");
    yourCardsContainer.innerHTML = "";

    yourCards.forEach((card, index) => {
        const cardDiv = document.createElement("div");
        cardDiv.className = "card";

        // ベースURLを追加して完全な画像URLを作成
        const baseURL = `${location.protocol}//${location.host}/`;
        const cardImage = document.createElement("img");
        cardImage.src = `${baseURL}${card.image}`; // 修正ポイント: ベースURLを追加
        cardImage.alt = `${card.Value} of ${card.Suit}`;
        cardImage.className = "card-image";

        //const cardText = document.createElement("span");
        //cardText.textContent = `${card.Value} of ${card.Suit}`;

        // card.SuitがSpecialの時のみツールチップを表示
        if (card.Suit === "Special" && card.Value ===100) {
            const tooltip = document.createElement("div");
            tooltip.className = "tooltip";
            tooltip.textContent = `効果: ${SpecialCard[0].effect}`; // カードに関連する効果を表示
            cardDiv.appendChild(tooltip);
        }

        if (card.Suit === "Special" && card.Value ===101) {
            const tooltip = document.createElement("div");
            tooltip.className = "tooltip";
            tooltip.textContent = `効果: ${SpecialCard[1].effect}`; // カードに関連する効果を表示
            cardDiv.appendChild(tooltip);
        }

        if (card.Suit === "Special" && card.Value ===102) {
            const tooltip = document.createElement("div");
            tooltip.className = "tooltip";
            tooltip.textContent = `効果: ${SpecialCard[2].effect}`; // カードに関連する効果を表示
            cardDiv.appendChild(tooltip);
        }

        cardDiv.appendChild(cardImage);
        //cardDiv.appendChild(cardText);

                // 初期位置を画面外に設定
        cardDiv.style.transform = `translateX(-350px) translateY(600px)`; // 画面外から飛んでくるようにする

        // 少し遅延を入れてカードを配布
        setTimeout(() => {
            cardDiv.style.transition = "transform 0.5s ease-in-out, opacity 0.5s ease-in-out";
            cardDiv.style.transform = `translateX(0) translateY(0)`; // カードが最終位置に移動
            cardDiv.classList.add("animate");
        }, index * 200); // 少しずつ遅延を入れて順番に配る

        // クリックイベントを設定
        cardDiv.addEventListener("click", () => toggleCardSelection(index, cardDiv));
        yourCardsContainer.appendChild(cardDiv);
    });
}



function toggleCardSelection(index, cardDiv) {
    const selectedIndex = selectedCards.findIndex((c) => c === yourCards[index]);
    const selectedCardsContainer = document.getElementById("selected-cards");

    if (selectedIndex !== -1) {
        // 選択解除
        selectedCards.splice(selectedIndex, 1);
        cardDiv.classList.remove("selected");

        // `selected-cards` から該当カードを削除し、`your-cards` に戻す
        selectedCardsContainer.removeChild(selectedCardsContainer.children[selectedIndex]);
        document.getElementById("your-cards").appendChild(cardDiv);
    } else if (selectedCards.length < 5) {
        // 選択
        selectedCards.push(yourCards[index]);
        cardDiv.classList.add("selected");

        // `selected-cards` に追加
        selectedCardsContainer.appendChild(cardDiv);
    }

    // Confirmボタンの有効化・無効化
    document.getElementById("confirm-selection").disabled = selectedCards.length !== 5;
}

// Confirmボタンの動作
document.getElementById("confirm-selection").addEventListener("click", () => {
    // 選択カードをサーバーに送信
    socket.send(JSON.stringify({
        type: "ready",
        selected: selectedCards,
    }));
    document.getElementById("confirm-selection").disabled =true;

});

document.getElementById('joinButton').addEventListener('click', () => {
    const roomID = document.getElementById('roomId').value;
    const playerName = document.getElementById('playerName').value;
    localPlayerName = playerName;

    if (!roomID || !playerName) {
        alert('ルームIDとプレイヤー名を入力してください');
        return;
    }

    socket.send(JSON.stringify({
        type: "join",
        room_id: roomID,
        name: playerName,
    }));
});

// 最終結果を表示するモーダル
function showFinalResult() {
    const modal = document.getElementById("final-result-modal");
    const message = document.getElementById("final-summary-message");
    
    message.innerHTML = `戦績: ${winCount}勝 ${lossCount}敗 ${drawCount}分`;
    modal.style.display = "flex";

    // 最終的に勝ち越していた場合、豪華な紙吹雪を降らせる
    if (winCount > lossCount) {
        const duration = 3 * 1000;
        const end = Date.now() + duration;

        (function frame() {
            confetti({
                particleCount: 3,
                angle: 60,
                spread: 55,
                origin: { x: 0 },
                colors: ['#bb0000', '#ffffff', '#ffd700']
            });
            confetti({
                particleCount: 3,
                angle: 120,
                spread: 55,
                origin: { x: 1 },
                colors: ['#bb0000', '#ffffff', '#ffd700']
            });

            if (Date.now() < end) {
                requestAnimationFrame(frame);
            }
        }());
    }
}

// ゲーム状態をリセット
function resetGameState() {
    yourCards = [];
    selectedCards = [];
    document.getElementById("your-cards").innerHTML = "";
    document.getElementById("opponent-cards").innerHTML = "";
    document.getElementById("selected-cards").innerHTML = "";

    // ラウンド結果モーダルを非表示に
    const roundModal = document.getElementById("round-result-modal");
    if (roundModal) roundModal.style.display = "none";
    const resultText = document.getElementById("result-message");
    if (resultText) resultText.textContent = "";

    document.getElementById("confirm-selection").disabled = true;

    // サーバーにリスタート通知を送信
    socket.send(JSON.stringify({
        type: "restart"
    }));
}