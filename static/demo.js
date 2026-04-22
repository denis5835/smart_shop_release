(function () {
    // --- Configuration ---
    const promptText = "Едем большой компанией на рыбалку на день. Нужно взять горелку, удочки, мебель и велосипеды на карбоновой раме. Аренду на выходные";
    let isRunning = false; 

    // --- Utility Functions ---
    const sleep = (ms) => new Promise(resolve => setTimeout(resolve, ms));
    const getRndInteger = (min, max) => Math.floor(Math.random() * (max - min + 1)) + min;

    // Helper to wait for an element to appear AND be visually rendered/active
    async function waitForVisibleElement(selector, maxWaitMs = 5000) {
        const startTime = Date.now();
        while (Date.now() - startTime < maxWaitMs) {
            // Get ALL matching elements in the DOM (in case of mobile/desktop duplicates or slider loops)
            const elements = Array.from(document.querySelectorAll(selector));

            for (const el of elements) {
                // If we are just checking for the existence of cards, return the first one
                if (selector === '.product-card-body') return el;

                // For interactive buttons, verify it is truly visible and not disabled
                const rect = el.getBoundingClientRect();
                const isVisible = el.offsetParent !== null && 
                                  window.getComputedStyle(el).display !== 'none' && 
                                  rect.width > 0 && rect.height > 0; // Crucial: prevents 0,0 cursor bug
                
                const isDisabled = el.disabled || 
                                   el.classList.contains('disabled') || 
                                   el.classList.contains('swiper-button-disabled');
                
                if (isVisible && !isDisabled) {
                    return el; // Return the exact button the user can actually see
                }
            }
            await sleep(200); 
        }
        return null;
    }

    // --- Fake Cursor Setup ---
    let cursor = document.getElementById('fake-presentation-cursor');
    if (!cursor) {
        cursor = document.createElement('div');
        cursor.id = 'fake-presentation-cursor';
        cursor.style.cssText = `
            position: absolute;
            top: -100px;
            left: -100px;
            width: 32px;
            height: 32px;
            background-color: rgba(56, 189, 248, 0.4); 
            border: 2px solid rgba(2, 132, 199, 0.6); 
            border-radius: 50%;
            pointer-events: none;
            z-index: 999999;
            opacity: 0;
            transform: translate(-50%, -50%);
            transition: top 0.4s ease-in-out, left 0.4s ease-in-out, transform 0.1s ease-out, background-color 0.1s, opacity 0.3s ease-in-out;
            box-shadow: 0 2px 8px rgba(0,0,0,0.15);
        `;
        document.body.appendChild(cursor);
    }

    // --- Interaction Helpers ---
    async function moveCursorTo(element) {
        if (!element) return;
        
        const rectCheck = element.getBoundingClientRect();
        if (rectCheck.width === 0 || rectCheck.height === 0) {
            console.warn("Attempted to move to an element with 0 width/height. Aborting move.");
            return;
        }
        
        element.scrollIntoView({ behavior: 'smooth', block: 'nearest', inline: 'nearest' });
        await sleep(400); 
        
        const rect = element.getBoundingClientRect();
        const top = rect.top + window.scrollY + (rect.height / 2);
        const left = rect.left + window.scrollX + (rect.width / 2);
        
        cursor.style.opacity = '1';
        cursor.style.top = `${top}px`;
        cursor.style.left = `${left}px`;
        await sleep(450); 
    }

    async function simulateClick(element) {
        if (!element) return;
        cursor.style.transform = 'translate(-50%, -50%) scale(0.7)';
        cursor.style.backgroundColor = 'rgba(56, 189, 248, 0.8)';
        await sleep(80); 
        
        element.click();
        
        cursor.style.transform = 'translate(-50%, -50%) scale(1)';
        cursor.style.backgroundColor = 'rgba(56, 189, 248, 0.4)';
        await sleep(150);
    }

    async function interactWith(element, hideAfter = true) {
        if(!element) return;
        await moveCursorTo(element);
        await simulateClick(element);
        
        if (hideAfter) {
            await sleep(100); 
            cursor.style.opacity = '0'; 
            await sleep(300); 
        }
    }

    // --- Core Automation Logic ---
    async function startAutomation() {
        if (isRunning) return;
        isRunning = true;

        try {
            console.log("Starting presentation automation...");
            
            // Use waitForVisibleElement to guarantee we get the correct visible inputs
            const input = await waitForVisibleElement('#chat-input');
            const button = await waitForVisibleElement('#send-btn');

            if (!input || !button) {
                console.error("Input or Send button not found or not visible!");
                return;
            }

            await interactWith(input, true);
            input.value = "";
            input.focus();
            
            for (let i = 0; i < promptText.length; i++) {
                input.value += promptText.charAt(i);
                input.dispatchEvent(new Event('input', { bubbles: true }));
                input.scrollTop = input.scrollHeight; 
                await sleep(getRndInteger(10, 30)); 
            }

            await sleep(400);
            await interactWith(button);
            console.log("Prompt sent. Waiting for container...");

            await waitForStagesView();
            console.log("Container loaded. Waiting for product cards to fetch...");
            
            const productsLoaded = await waitForVisibleElement('.product-card-body', 5000);
            if (!productsLoaded) {
                console.warn("No product cards found. Proceeding to cart.");
            } else {
                console.log("Products rendered. Processing selection...");
                await sleep(800); 
                await processProducts();
            }
            
            console.log("Moving to checkout phase...");
            await sleep(600);
            // Wait for whichever cart trigger is currently visible
            const cartTrigger = await waitForVisibleElement('#show-cart-trigger, .show-cart-trigger', 2000);
            if(cartTrigger) await interactWith(cartTrigger);
            
            await sleep(1200); 
            // Wait for whichever checkout button is currently visible
            const checkoutBtn = await waitForVisibleElement('#checkout-btn-spa, .checkout-btn', 2000);
            if(checkoutBtn) await interactWith(checkoutBtn);
            
            console.log("Presentation finished!");
            
        } catch (error) {
            console.error("Presentation script stopped due to an error:", error);
        } finally {
            isRunning = false;
            cursor.style.opacity = '0';
        }
    }

    function waitForStagesView() {
        return new Promise((resolve) => {
            const element = document.querySelector('#stages-view');
            if (element && window.getComputedStyle(element).display === 'flex') {
                return resolve();
            }

            const observer = new MutationObserver((mutations) => {
                for (let mutation of mutations) {
                    if (mutation.attributeName === 'style' || mutation.attributeName === 'class') {
                        if (window.getComputedStyle(element).display === 'flex') {
                            observer.disconnect();
                            resolve();
                        }
                    }
                }
            });
            observer.observe(element, { attributes: true, attributeFilter: ['style', 'class'] });
        });
    }

    function isElementInHorizontalViewport(el) {
        const rect = el.getBoundingClientRect();
        // Skip ghost elements
        if (rect.width === 0 || rect.height === 0) return false;
        
        const elementCenterX = rect.left + (rect.width / 2);
        return elementCenterX >= 0 && elementCenterX <= (window.innerWidth || document.documentElement.clientWidth);
    }

async function processProducts() {
        // INCREASED: Now wants to buy between 6 and 8 items total
        const totalItemsToClick = getRndInteger(6, 8); 
        let itemsClicked = 0; 
        let pagesProcessed = 0;
        const maxPages = 8; 
        
        console.log(`Targeting ${totalItemsToClick} unique products across multiple slides.`);

        while (pagesProcessed < maxPages) {
            await sleep(800);

            // As long as we haven't hit our bigger quota, keep looking for items
            if (itemsClicked < totalItemsToClick) {
                // Find visible cards that have physical dimensions
                let visibleCards = Array.from(document.querySelectorAll('.product-card-body')).filter(c => {
                    return !c.dataset.clicked && isElementInHorizontalViewport(c);
                });
                
                if (visibleCards.length > 0) {
                    visibleCards = visibleCards.sort(() => 0.5 - Math.random());
                    
                    // PACING: Pick 1 or 2 items max per slide. 
                    // This forces the script to go to later slides to get all 6-8 items.
                    let itemsToPickOnThisPage = Math.min(getRndInteger(1, 2), totalItemsToClick - itemsClicked);
                    
                    for (let i = 0; i < itemsToPickOnThisPage && i < visibleCards.length; i++) {
                        let card = visibleCards[i];
                        
                        // We also need to grab the *visible* buttons inside the card
                        let btns = Array.from(card.querySelectorAll('.btn-rent, .btn-buy')).filter(b => {
                           const br = b.getBoundingClientRect();
                           return br.width > 0 && br.height > 0 && window.getComputedStyle(b).display !== 'none';
                        });
                        
                        let targetBtn = btns.length > 0 ? btns[0] : null;

                        if (targetBtn) {
                            card.dataset.clicked = "true"; 
                            await interactWith(targetBtn);
                            
                            let extraQtyClicks = getRndInteger(0, 3);
                            if (extraQtyClicks > 0) {
                                // Find visible '+' buttons
                                let plusBtns = Array.from(card.querySelectorAll('.cart-qty-btn')).filter(b => {
                                    const br = b.getBoundingClientRect();
                                    return br.width > 0;
                                });
                                // Usually the second one is '+' (minus is first)
                                let plusBtn = plusBtns.length > 1 ? plusBtns[1] : null; 
                                
                                if (plusBtn) {
                                    for (let q = 0; q < extraQtyClicks; q++) {
                                        await interactWith(plusBtn);
                                    }
                                }
                            }
                            itemsClicked++;
                        }
                    }
                }
            }

            console.log("Looking for visible #slide-next button...");
            let nextBtn = await waitForVisibleElement('#slide-next, .slide-nav-next', 1500);
            
            if (nextBtn) {
                console.log(`Clicking visible #slide-next (Moving to Slide ${pagesProcessed + 2})...`);
                await interactWith(nextBtn);
                await sleep(1000); 
                pagesProcessed++;
            } else {
                console.log("No active/visible #slide-next found (End of carousel). Ending browsing.");
                break; 
            }
        }
        console.log(`Finished browsing. Selected ${itemsClicked} items total.`);
    }

    // --- Trigger Listener ---
    document.addEventListener('keydown', function(e) {
        if (e.shiftKey && e.key === 'Enter') {
            e.preventDefault(); 
            startAutomation();
        }
    });

    console.log("Demo script loaded! Press Shift + Enter to start.");

})();