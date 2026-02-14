// 本番・ローカル両対応のWebSocket URL生成
const wsProtocol = location.protocol === "https:" ? "wss:" : "ws:";
const wsHost = location.host;
const socket = new WebSocket(`${wsProtocol}//${wsHost}/ws`);

let yourCards = []; // サーバーから送られる自分のカード
let selectedCards = []; // プレイヤーが選択したカード

const SpecialCard = [
    { effect: "相手のカードを全て破壊" },
    { effect: "相手の特殊カードを無効にする" },
    { effect: "相手の手札上限を１減らす" },
];

// サーバーからのメッセージを受信
socket.onmessage = (event) => {
    
    const message = JSON.parse(event.data);
    console.log("Received message:", message); // 受信データを確認
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
        
        // 結果メッセージを表示
        const resultElement = document.getElementById("game-result");
        const resultText = document.getElementById("result-message");

        resultText.textContent = resultMessage; // 結果メッセージを設定
        resultElement.style.display = "block";  // 結果表示エリアを表示

        // リスタートボタンを表示
        document.getElementById("restart-button").style.display = "inline-block";
                // 勝利数を更新
        if (resultMessage === "You win") {
            const yourWins = document.getElementById("your-wins");
            yourWins.textContent = parseInt(yourWins.textContent) + 1;
        }
        // ラウンド数を更新
        const roundCount = document.getElementById("round-count");
        roundCount.textContent = message.round; // サーバーからラウンド数を受け取って更新
        if(message.round > 5)
        {
            alert("ゲーム終了");
            document.getElementById("restart-button").style.display = "none";
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

    if (!roomID || !playerName) {
        alert('ルームIDとプレイヤー名を入力してください');
        return;
    }

    socket.send(JSON.stringify({
        type: "join",
        room_id: roomID,
        name: playerName,
    }));
            // 参加ボタンを非表示にし、ゲーム情報を表示
    document.getElementById("joinButton").style.display = "none";
    document.getElementById("join").style.display = "none";
    document.getElementById("game-stats").style.display = "block";
});

// リスタートボタンの動作
document.getElementById("restart-button").addEventListener("click", () => {
    resetGameState();

    // ボタンを隠す
    document.getElementById("restart-button").style.display = "none";
});

// ゲーム状態をリセット
function resetGameState() {
    yourCards = [];
    selectedCards = [];
    document.getElementById("your-cards").innerHTML = "";
    document.getElementById("opponent-cards").innerHTML = "";
    document.getElementById("selected-cards").innerHTML = "";

    // 結果表示を非表示に
    const resultElement = document.getElementById("game-result");
    if (resultElement) {
        resultElement.style.display = "none";
        document.getElementById("result-message").textContent = "";
    }

    // ボタンの状態をリセット
    document.getElementById("confirm-selection").disabled = true;
    document.getElementById("restart-button").style.display = "none";

    // サーバーにリスタート通知を送信
    socket.send(JSON.stringify({
        type: "restart"
    }));
}