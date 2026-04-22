function getCookie(name) {
    let val = null;
    document.cookie.split(';').forEach(c => {
        c = c.trim();
        if (c.startsWith(name + '=')) val = decodeURIComponent(c.substring(name.length + 1));
    });
    return val;
}

document.addEventListener('DOMContentLoaded', () => {
    const chatInput = document.getElementById('chat-input');
    const sendBtn = document.getElementById('send-btn');
    const chatWindow = document.getElementById('chat-window');
    const heroView = document.getElementById('hero-view');
    const stagesView = document.getElementById('stages-view');
    const stageSlide = document.getElementById('stage-slide');
    const stageStepper = document.getElementById('stage-stepper');
    const stageTotal = document.getElementById('stage-total');
    const backBtn = document.getElementById('back-to-hero');
    const globalRentDec = document.getElementById('global-rent-dec');
    const globalRentInc = document.getElementById('global-rent-inc');
    const globalRentLabel = document.getElementById('global-rent-label');
    const newChatBtn = document.getElementById('new-chat-btn');
    const statusText = document.querySelector('.status-text');
    const cartView = document.getElementById('cart-view');
    const cartContent = document.getElementById('cart-content');
    const cartToStagesBtn = document.getElementById('cart-to-stages');

    if (!chatInput || !sendBtn) return;

    function autoResizeInput() {
        chatInput.style.height = 'auto';
        chatInput.style.height = (chatInput.scrollHeight) + 'px';
        // Limit height to ~5 lines
        if (chatInput.scrollHeight > 120) {
            chatInput.style.overflowY = 'auto';
            chatInput.style.height = '120px';
        } else {
            chatInput.style.overflowY = 'hidden';
        }
    }

    chatInput.addEventListener('input', autoResizeInput);

    let chatHistory = [];
    let allStages = [];
    let currentStageIdx = 0;
    let globalRentDays = 1;
    let cartState = {}; // { productId: { qty, mode: 'rent'|'buy' } }
    let highlightedStages = new Set();

    function getDiscountMultiplier(days) {
        if (days >= 14) return 0.7;
        if (days >= 7) return 0.8;
        if (days >= 3) return 0.9;
        return 1.0;
    }

    function calcRentTotalStr(dailyPriceStr, days) {
        const base = parseFloat(dailyPriceStr.replace(',', '.'));
        const mult = getDiscountMultiplier(days);
        return (base * days * mult).toFixed(2);
    }


    //  TOAST

    function showToast(title, message, type = 'success') {
        const container = document.getElementById('toast-container');
        if (!container) return;
        const toast = document.createElement('div');
        toast.className = `toast toast-${type}`;
        const icon = type === 'success' ? 'fa-check' : 'fa-xmark';
        toast.innerHTML = `
            <div class="toast-icon"><i class="fa-solid ${icon}"></i></div>
            <div class="toast-body"><h4>${title}</h4><p>${message}</p></div>`;
        container.appendChild(toast);
        setTimeout(() => {
            toast.classList.add('toast-out');
            setTimeout(() => toast.remove(), 250);
        }, 2800);
    }


    //  CHAT

    function renderMessage(text, role) {
        if (!text) return;
        const d = document.createElement('div');
        d.className = `message ${role}-message`;
        const c = document.createElement('div');
        c.className = 'msg-content';
        c.innerHTML = text.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>').replace(/\n/g, '<br>');
        d.appendChild(c);
        chatWindow.appendChild(d);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function showLoader(text) {
        removeLoader();
        const d = document.createElement('div');
        d.className = 'message ai-message';
        d.id = 'loading-msg';
        d.innerHTML = `<div class="msg-content"><i class="fa-solid fa-circle-notch fa-spin"></i> ${text}</div>`;
        chatWindow.appendChild(d);
        chatWindow.scrollTop = chatWindow.scrollHeight;
    }

    function removeLoader() {
        const el = document.getElementById('loading-msg');
        if (el) el.remove();
    }


    //  STAGE STEPPER (sidebar on wide screens)

    function buildStepper() {
        if (!stageStepper) return;
        stageStepper.innerHTML = '';
        allStages.forEach((s, i) => {
            const step = document.createElement('div');
            step.className = 'step-item' + (i === currentStageIdx ? ' active' : '') + (i < currentStageIdx ? ' done' : '');
            const dot = highlightedStages.has(i) && i !== currentStageIdx ? '<span class="status-dot"></span>' : '';
            step.innerHTML = `
                <div class="step-num">${i < currentStageIdx ? '<i class="fa-solid fa-check"></i>' : (i + 1)}</div>
                <span class="step-name">${s.label}${dot}</span>`;
            step.addEventListener('click', () => { currentStageIdx = i; renderCurrentStage(); });
            stageStepper.appendChild(step);
        });
    }


    //  SLIDES / STAGES

    function preloadStageImages(stage) {
        return new Promise(resolve => {
            if (!stage || !stage.products) return resolve();
            const urls = [];
            stage.products.forEach(p => { if (p.image_url) urls.push(p.image_url); });
            if (urls.length === 0) return resolve();
            let loaded = 0;
            const done = () => { loaded++; if (loaded >= urls.length) resolve(); };
            urls.forEach(u => {
                const img = new Image();
                img.onload = done;
                img.onerror = done;
                img.src = u;
            });
            // Safety timeout: don't wait more than 3s per stage
            setTimeout(resolve, 3000);
        });
    }

    async function preloadRemainingStages(stages) {
        for (let i = 1; i < stages.length; i++) {
            await preloadStageImages(stages[i]);
        }
    }

    async function showStages(newStages) {
        if (!newStages || newStages.length === 0) return;
        
        const isFirstLoad = allStages.length === 0;
        let firstAffectedIdx = -1;

        newStages.forEach(ns => {
            const existingIdx = allStages.findIndex(s => s.label === ns.label);
            if (existingIdx !== -1) {
                allStages[existingIdx] = ns;
                if (!isFirstLoad) highlightedStages.add(existingIdx);
                if (firstAffectedIdx === -1) firstAffectedIdx = existingIdx;
            } else {
                allStages.push(ns);
                if (!isFirstLoad) highlightedStages.add(allStages.length - 1);
                if (firstAffectedIdx === -1) firstAffectedIdx = allStages.length - 1;
            }
        });

        currentStageIdx = firstAffectedIdx !== -1 ? firstAffectedIdx : 0;

        // Preload ONLY the first of the new stages before revealing
        showLoader('Загружаю изображения...');
        await preloadStageImages(newStages[0]);
        removeLoader();

        heroView.style.display = 'none';
        stagesView.style.display = 'flex';
        buildStepper();
        renderCurrentStage();

        // Preload the rest of the NEW stages in background
        preloadRemainingStages(newStages);

        const panel = document.getElementById('content-panel');
        panel.scrollTop = 0;
        if (window.innerWidth <= 768) {
            panel.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }
    }

    function renderCurrentStage() {
        const stage = allStages[currentStageIdx];
        if (!stage) return;

        // Update stepper
        if (stageStepper) {
            stageStepper.querySelectorAll('.step-item').forEach((s, i) => {
                s.className = 'step-item' + (i === currentStageIdx ? ' active' : '') + (i < currentStageIdx ? ' done' : '');
                const numEl = s.querySelector('.step-num');
                if (numEl) numEl.innerHTML = i < currentStageIdx ? '<i class="fa-solid fa-check"></i>' : (i + 1);
                if (i === currentStageIdx) {
                    const statusDot = s.querySelector('.status-dot');
                    if (statusDot) statusDot.remove();
                }
            });
        }

        // Build slide content
        stageSlide.innerHTML = '';

        // Navigation row
        const navRow = document.createElement('div');
        navRow.className = 'slide-nav-row';
        const prevDisabled = currentStageIdx === 0 ? 'disabled' : '';
        const isLastStage = currentStageIdx === allStages.length - 1;
        
        const nextButtonHTML = isLastStage
            ? `<button class="slide-nav-btn slide-nav-next show-cart-trigger" style="background: #3b82f6; border-color: #3b82f6;">
                   В корзину <i class="fa-solid fa-cart-shopping"></i>
               </button>`
            : `<button class="slide-nav-btn slide-nav-next" id="slide-next">
                   Далее <i class="fa-solid fa-arrow-right"></i>
               </button>`;
               
        const hlBadge = highlightedStages.has(currentStageIdx) 
            ? '<span class="badge-new">Обновлено</span>' : '';
        highlightedStages.delete(currentStageIdx);

        navRow.innerHTML = `
            <button class="slide-nav-btn" id="slide-prev" ${prevDisabled}>
                <i class="fa-solid fa-arrow-left"></i> Назад
            </button>
            <div class="slide-nav-info">
                <span class="slide-nav-count">${currentStageIdx + 1} / ${allStages.length}</span>
                <h3>${stage.label}${hlBadge}</h3>
            </div>
            ${nextButtonHTML}`;
        stageSlide.appendChild(navRow);

        // Products grid
        const grid = document.createElement('div');
        grid.className = 'products-grid';

        stage.products.forEach(p => {
            const card = document.createElement('div');
            card.className = 'product-card';
            const cs = cartState[p.id];
            const qty = cs ? cs.qty : 0;
            const rentable = p.rentable !== false;
            let discountBadge = '';
            if (rentable && globalRentDays >= 3) {
                const perc = Math.round((1 - getDiscountMultiplier(globalRentDays)) * 100);
                discountBadge = `<span style="color: #ef4444; font-size: 0.65rem; font-weight: 700; margin-left: 4px;">-${perc}%</span>`;
            }
            const rentPriceHTML = rentable
                ? `<div class="price-rent"><i class="fa-solid fa-clock"></i> ${calcRentTotalStr(p.rent_price, globalRentDays)} <span>BYN за ${globalRentDays} дн.</span>${discountBadge}</div>`
                : '';
            card.innerHTML = `
                <img class="product-card-img"
                     src="${p.image_url || 'https://placehold.co/230x150?text=Фото'}"
                     alt="${p.name}">
                <div class="product-card-body">
                    <h4>${p.name}</h4>
                    <p class="product-card-desc">${p.description || ''}</p>
                    <div class="product-card-prices">
                        ${rentPriceHTML}
                        <div class="price-buy"><i class="fa-solid fa-tag"></i> ${p.original_price} <span>BYN</span></div>
                    </div>
                    <div class="cart-area" data-product-id="${p.id}" data-product-name="${esc(p.name)}"
                         data-rentable="${rentable}">
                        ${qty > 0 ? cartControlsHTML(p.id, qty, cs.mode) : addButtonsHTML(p.id, rentable)}
                    </div>
                </div>`;
            grid.appendChild(card);
        });

        stageSlide.appendChild(grid);

        // Wire up nav buttons
        const prevB = document.getElementById('slide-prev');
        const nextBtn = document.getElementById('slide-next');
        if (prevB) prevB.addEventListener('click', () => { if (currentStageIdx > 0) { currentStageIdx--; renderCurrentStage(); } });
        if (nextBtn) nextBtn.addEventListener('click', () => { currentStageIdx++; renderCurrentStage(); });
        const cartTrigger = stageSlide.querySelector('.show-cart-trigger');
        if (cartTrigger) cartTrigger.addEventListener('click', (e) => { e.preventDefault(); showCart(); });

        // Predictive preload: proactively load the NEXT stage images
        if (allStages[currentStageIdx + 1]) {
            preloadStageImages(allStages[currentStageIdx + 1]);
        }
    }

    function addButtonsHTML(id, rentable) {
        const rentBtn = rentable !== false
            ? `<button class="card-cart-btn btn-rent" data-action="rent">
                   <i class="fa-solid fa-clock"></i> Арендовать
               </button>`
            : '';
        return `<div class="add-buttons">
                    ${rentBtn}
                    <button class="card-cart-btn btn-buy" data-action="buy">
                        <i class="fa-solid fa-bag-shopping"></i> Купить
                    </button>
                </div>`;
    }

    function cartControlsHTML(id, qty, mode) {
        const modeLabel = mode === 'buy' ? 'Покупка' : 'Аренда';
        const modeIcon = mode === 'buy' ? 'fa-bag-shopping' : 'fa-clock';
        return `<div>
                    <div class="cart-controls">
                        <button class="cart-qty-btn" data-action="dec">−</button>
                        <span class="cart-qty-label">${qty}</span>
                        <button class="cart-qty-btn" data-action="inc">+</button>
                    </div>
                    <div class="in-cart-badge"><i class="fa-solid ${modeIcon}"></i> ${modeLabel} · В корзине</div>
                </div>`;
    }

    function esc(s) { return (s || '').replace(/"/g, '&quot;'); }


    //  EVENT DELEGATION

    if (stageSlide) {
        stageSlide.addEventListener('click', async (e) => {
            const btn = e.target.closest('[data-action]');
            if (!btn) return;

            const action = btn.dataset.action;
            const cartArea = btn.closest('.cart-area');
            if (!cartArea) return;

            const id = cartArea.dataset.productId;
            const name = (cartArea.dataset.productName || '').replace(/&quot;/g, '"');

            btn.disabled = true;

            if (action === 'rent') {
                await addToCart(id, name, 'rent');
            } else if (action === 'buy') {
                await addToCart(id, name, 'buy');
            } else if (action === 'inc') {
                const mode = cartState[id] ? cartState[id].mode : 'rent';
                await addToCart(id, '', mode);
            } else if (action === 'dec') {
                await removeFromCart(id);
            }

            btn.disabled = false;
        });
    }


    //  GLOBAL RENT CONTROLS

    if (globalRentDec && globalRentInc && globalRentLabel) {
        globalRentDec.addEventListener('click', () => {
            if (globalRentDays > 1) {
                globalRentDays--;
                globalRentLabel.textContent = `${globalRentDays} дн.`;
                if (allStages.length > 0) renderCurrentStage();
            }
        });
        globalRentInc.addEventListener('click', () => {
            if (globalRentDays < 30) {
                globalRentDays++;
                globalRentLabel.textContent = `${globalRentDays} дн.`;
                if (allStages.length > 0) renderCurrentStage();
            }
        });
    }


    //  CART ACTIONS

    async function addToCart(productId, productName, mode) {
        try {
            const r = await fetch('/cart/add', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken')},
                body: JSON.stringify({product_id: productId, days: globalRentDays, mode: mode})
            });
            const res = await r.json();
            if (res.status === 'success') {
                if (!cartState[productId]) {
                    cartState[productId] = { qty: 0, mode: mode };
                }
                cartState[productId].qty += 1;
                updateCartArea(productId);
                if (productName) {
                    const short = productName.length > 35 ? productName.substring(0, 35) + '…' : productName;
                    const modeText = mode === 'buy' ? 'к покупке' : 'к аренде';
                    showToast('Добавлено ' + modeText, short, 'success');
                }
            }
        } catch (e) {
            console.error(e);
            showToast('Ошибка', 'Не удалось добавить', 'error');
        }
    }

    async function removeFromCart(productId) {
        if (!cartState[productId]) return;
        if (cartState[productId].qty <= 1) {
            delete cartState[productId];
        } else {
            cartState[productId].qty -= 1;
        }
        updateCartArea(productId);
    }

    function updateCartArea(id) {
        document.querySelectorAll(`.cart-area[data-product-id="${id}"]`).forEach(area => {
            const cs = cartState[id];
            const rentable = area.dataset.rentable !== 'false';
            area.innerHTML = cs && cs.qty > 0
                ? cartControlsHTML(id, cs.qty, cs.mode)
                : addButtonsHTML(id, rentable);
        });
    }


    //  SPA CART LOGIC

    async function showCart(updateHistory = true) {
        heroView.style.display = 'none';
        stagesView.style.display = 'none';
        cartView.style.display = 'block';

        if (updateHistory) {
            window.history.pushState({view: 'cart'}, '', '/cart/');
        }

        cartContent.innerHTML = '<div class="loading-state"><i class="fa-solid fa-spinner fa-spin"></i> Загрузка корзины...</div>';

        try {
            const r = await fetch('/api/cart');
            const data = await r.json();
            renderCartContent(data);
        } catch (e) {
            console.error(e);
            cartContent.innerHTML = '<p class="error">Не удалось загрузить корзину.</p>';
        }
    }

    function hideCart(updateHistory = true) {
        cartView.style.display = 'none';
        if (allStages.length > 0) {
            stagesView.style.display = 'flex';
        } else {
            heroView.style.display = 'block';
        }

        if (updateHistory) {
            window.history.pushState({view: 'main'}, '', '/');
        }
    }

    function renderCartContent(data) {
        if (!data.items || data.items.length === 0) {
            cartContent.innerHTML = `
                <div class="empty-cart-spa">
                    <i class="fa-solid fa-box-open fa-3x"></i>
                    <p>Корзина пуста. Поговорите с ИИ-ассистентом, чтобы найти снаряжение!</p>
                </div>`;
            return;
        }

        let html = `
            <table class="cart-table">
                <thead>
                    <tr><th>Товар</th><th>Тип</th><th>Кол-во</th><th>Итого</th></tr>
                </thead>
                <tbody>`;
        
        data.items.forEach(item => {
            const modeLabel = item.mode === 'buy' ? 'Покупка' : `Аренда · ${item.days} дн.`;
            const badgeClass = item.mode === 'buy' ? 'badge-buy' : 'badge-rent';
            const icon = item.mode === 'buy' ? 'fa-bag-shopping' : 'fa-clock';

            html += `
                <tr>
                    <td>
                        <div class="cart-product-info">
                            ${item.image_url ? `<img src="${item.image_url}" alt="${item.name}">` : ''}
                            <span>${item.name}</span>
                        </div>
                    </td>
                    <td><span class="cart-mode-badge ${badgeClass}"><i class="fa-solid ${icon}"></i> ${modeLabel}</span></td>
                    <td>${item.quantity}</td>
                    <td><strong>${item.subtotal} BYN</strong></td>
                </tr>`;
        });

        html += `
                </tbody>
            </table>
            <div class="cart-summary">
                <h3>К оплате: <span class="highlight">${data.total} BYN</span></h3>
                <button id="checkout-btn-spa" class="btn btn-primary"><i class="fa-solid fa-credit-card"></i> Оформить заказ</button>
            </div>`;
        
        cartContent.innerHTML = html;

        document.getElementById('checkout-btn-spa').addEventListener('click', runCheckout);
    }

    async function runCheckout() {
        const btn = document.getElementById('checkout-btn-spa');
        btn.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i> Обработка...';
        btn.disabled = true;
        try {
            const r = await fetch('/cart/checkout', { method: 'POST', headers: {'X-CSRFToken': getCookie('csrftoken')} });
            const res = await r.json();
            if (res.status === 'success') {
                showToast('Готово!', 'Заказ оформлен.', 'success');
                setTimeout(() => window.location.href = '/cart/success', 1000);
            } else {
                showToast('Ошибка', 'Не удалось оформить', 'error');
                btn.innerHTML = '<i class="fa-solid fa-credit-card"></i> Оформить заказ';
                btn.disabled = false;
            }
        } catch (e) {
            showToast('Ошибка сети', 'Проверьте соединение', 'error');
            btn.innerHTML = '<i class="fa-solid fa-credit-card"></i> Оформить заказ';
            btn.disabled = false;
        }
    }

    if (cartToStagesBtn) {
        cartToStagesBtn.addEventListener('click', () => {
            window.history.back();
        });
    }

    // Navbar cart button
    document.querySelectorAll('.cart-btn').forEach(btn => {
        btn.addEventListener('click', (e) => {
            e.preventDefault();
            showCart();
        });
    });

    window.addEventListener('popstate', (e) => {
        if (e.state && e.state.view === 'cart') {
            showCart(false);
        } else {
            hideCart(false);
        }
    });

    // Check initial view
    if (window.START_VIEW === 'cart') {
        showCart(false);
    }


    //  BACK BUTTON

    if (backBtn) backBtn.addEventListener('click', () => {
        stagesView.style.display = 'none';
        heroView.style.display = 'block';
    });


    //  IDEA CARDS

    document.querySelectorAll('.idea-card').forEach(card => {
        card.addEventListener('click', () => {
            const prompt = card.dataset.prompt;
            if (prompt) { chatInput.value = prompt; sendMessage(); }
        });
    });


    //  SEND

    let isProcessing = false;
    let abortController = null;

    async function sendMessage() {
        const text = chatInput.value.trim();
        if (!text) return;

        if (isProcessing) {
            if (abortController) abortController.abort();
            
            const lastMsgObj = chatHistory[chatHistory.length - 1];
            if (lastMsgObj && lastMsgObj.role === 'user') {
                lastMsgObj.content += " " + text;
                const userBubbles = chatWindow.querySelectorAll('.user-message .msg-content');
                if (userBubbles.length > 0) {
                    userBubbles[userBubbles.length - 1].innerText += " " + text;
                }
            } else {
                chatHistory.push({role: 'user', content: text});
                renderMessage(text, 'user');
            }
            
            chatInput.value = '';
            chatInput.style.height = 'auto';
            
            // Allow AbortController to cleanly cancel before restarting
            setTimeout(startChatFetch, 50);
            return;
        }

        renderMessage(text, 'user');
        chatInput.value = '';
        chatInput.style.height = 'auto';
        chatHistory.push({role: 'user', content: text});
        startChatFetch();
    }

    async function startChatFetch() {
        isProcessing = true;
        abortController = new AbortController();
        showLoader('Ищу подходящее снаряжение...');
        chatInput.placeholder = 'Уточните...';

        try {
            const r = await fetch('/api/chat', {
                method: 'POST',
                headers: {'Content-Type': 'application/json', 'X-CSRFToken': getCookie('csrftoken')},
                body: JSON.stringify({messages: chatHistory}),
                signal: abortController.signal
            });

            const reader = r.body.getReader();
            const decoder = new TextDecoder('utf-8');
            let done = false;
            let buffer = '';

            while (!done) {
                const { value, done: readerDone } = await reader.read();
                done = readerDone;
                if (value) {
                    buffer += decoder.decode(value, {stream: true});
                    let lines = buffer.split('\n');
                    buffer = lines.pop(); 

                    for (let line of lines) {
                        if (!line.trim()) continue;
                        try {
                            const res = JSON.parse(line);
                            if (res.status === 'progress') {
                                const loaderText = document.querySelector('#loading-msg .msg-content');
                                if (loaderText) loaderText.innerHTML = `<i class="fa-solid fa-circle-notch fa-spin"></i> ${res.message}`;
                            } else if (res.status === 'done' || res.status === 'error') {
                                removeLoader();
                                if (res.rent_days) {
                                    globalRentDays = parseInt(res.rent_days) || 1;
                                    if (globalRentDays < 1) globalRentDays = 1;
                                    if (globalRentDays > 30) globalRentDays = 30;
                                    if (globalRentLabel) globalRentLabel.textContent = `${globalRentDays} дн.`;
                                }
                                if (res.stages && res.stages.length > 0) {
                                    showStages(res.stages);
                                }
                                if (res.reply) {
                                    renderMessage(res.reply, 'ai');
                                    chatHistory.push({role: 'assistant', content: res.reply});
                                }
                                isProcessing = false;
                                chatInput.placeholder = 'Напишите запрос...';
                                return;
                            }
                        } catch(e) { console.error('Parse chunk error', e, line); }
                    }
                }
            }
        } catch (err) {
            if (err.name === 'AbortError') {
                console.log('Fetch aborted, restarting...');
            } else {
                removeLoader();
                console.error('Chat error:', err);
                renderMessage('Произошла ошибка. Проверьте подключение.', 'ai');
            }
        } finally {
            if (statusText) statusText.textContent = 'В сети';
            chatInput.disabled = false;
            chatInput.placeholder = 'Введите запрос...';
            chatInput.style.height = 'auto';
            chatInput.focus();
            sendBtn.disabled = false;
            abortController = null;
        }
    }

    sendBtn.addEventListener('click', sendMessage);
    chatInput.addEventListener('keydown', (e) => {
        if (e.key === 'Enter' && !e.shiftKey) {
            e.preventDefault();
            sendMessage();
        }
    });

    if (newChatBtn) {
        newChatBtn.addEventListener('click', () => {
            if (isProcessing) {
                if (abortController) abortController.abort();
                isProcessing = false;
            }
            chatHistory = [];
            allStages = [];
            currentStageIdx = 0;
            cartState = {};
            highlightedStages.clear();
            
            chatWindow.innerHTML = `
                <div class="message ai-message">
                    <div class="msg-content">
                        Привет! 👋 Я твой гид по активному отдыху. Расскажи о своих планах, и я подберу всё снаряжение!
                    </div>
                </div>`;
            
            stagesView.style.display = 'none';
            heroView.style.display = 'block';
            chatInput.value = '';
            chatInput.placeholder = 'Напишите запрос...';
            
            showToast('Чат сброшен', 'Начните новое приключение!');
        });
    }
});
