/**
 * HaxZero - High Performance Haxball Mobile Client
 * Otimizado para Android intermediário | Latência mínima | Zero travamentos
 * 
 * Arquitetura:
 * - Module Pattern (encapsulation)
 * - Object Pool (reuso de objetos)
 * - Event delegation (menos listeners)
 * - Throttle/Debounce (reduz processamento)
 * - DOM caching (queries otimizadas)
 * - Typed Arrays (quando aplicável)
 */

// ============================================================================
// 1. UTILIDADES DE PERFORMANCE
// ============================================================================

const PerfUtils = (() => {
    // Cache de funções throttled
    const throttledFunctions = new Map();
    const debouncedFunctions = new Map();

    /**
     * Throttle: limita execução a cada N ms
     * Use: eventos de alta frequência (touch, scroll)
     */
    function throttle(fn, delay, id) {
        if (!throttledFunctions.has(id)) {
            let lastCall = 0;
            throttledFunctions.set(id, function(...args) {
                const now = performance.now();
                if (now - lastCall >= delay) {
                    lastCall = now;
                    fn.apply(this, args);
                }
            });
        }
        return throttledFunctions.get(id);
    }

    /**
     * Debounce: executa após N ms sem chamadas
     * Use: input de usuário, resize
     */
    function debounce(fn, delay, id) {
        if (!debouncedFunctions.has(id)) {
            let timeoutId = null;
            debouncedFunctions.set(id, function(...args) {
                if (timeoutId) clearTimeout(timeoutId);
                timeoutId = setTimeout(() => {
                    fn.apply(this, args);
                    timeoutId = null;
                }, delay);
            });
        }
        return debouncedFunctions.get(id);
    }

    /**
     * Memoization para funções puras
     */
    function memoize(fn) {
        const cache = new Map();
        return function(...args) {
            const key = JSON.stringify(args);
            if (cache.has(key)) {
                return cache.get(key);
            }
            const result = fn.apply(this, args);
            cache.set(key, result);
            return result;
        };
    }

    return { throttle, debounce, memoize };
})();

// ============================================================================
// 2. OBJECT POOL - Reutiliza objetos para reduzir GC
// ============================================================================

const ObjectPool = (() => {
    const pools = new Map();

    function createPool(name, factory, initialSize = 10) {
        const available = [];
        const inUse = new Set();

        // Pré-aloca objetos
        for (let i = 0; i < initialSize; i++) {
            available.push(factory());
        }

        pools.set(name, { available, inUse, factory });
    }

    function acquire(poolName) {
        const pool = pools.get(poolName);
        if (!pool) return pool.factory();

        let obj = pool.available.pop();
        if (!obj) {
            obj = pool.factory();
        }
        pool.inUse.add(obj);
        return obj;
    }

    function release(poolName, obj) {
        const pool = pools.get(poolName);
        if (!pool) return;

        pool.inUse.delete(obj);
        
        // Reset do objeto
        if (obj.reset) obj.reset();
        
        pool.available.push(obj);
    }

    return { createPool, acquire, release };
})();

// ============================================================================
// 3. DOM CACHE - Reduz querySelector calls
// ============================================================================

const DOMCache = (() => {
    const cache = new Map();
    let gameFrame = null;
    let body = null;

    function init(frame) {
        gameFrame = frame;
    }

    function setBody(bodyElement) {
        body = bodyElement;
    }

    function query(selector, context = document) {
        const key = `${selector}:${context === gameFrame ? 'frame' : 'main'}`;
        
        if (cache.has(key)) {
            return cache.get(key);
        }

        const element = context.querySelector(selector);
        if (element) {
            cache.set(key, element);
        }
        return element;
    }

    function queryAll(selector, context = document) {
        return context.querySelectorAll(selector);
    }

    /**
     * Getter seguro com fallback
     */
    function getByHook(hook) {
        return body?.querySelector(`[data-hook="${hook}"]`) || null;
    }

    function invalidate(selector) {
        cache.forEach((_, key) => {
            if (key.includes(selector)) {
                cache.delete(key);
            }
        });
    }

    function clear() {
        cache.clear();
    }

    return {
        init,
        setBody,
        query,
        queryAll,
        getByHook,
        invalidate,
        clear
    };
})();

// ============================================================================
// 4. CONTROLS - Sistema de joystick otimizado
// ============================================================================

const ControlSystem = (() => {
    let joystick = null;
    let kickButton = null;
    let thumb = null;
    let isTouching = false;
    
    // Cache de estado para evitar redraws desnecessários
    let lastJoystickDirection = "";
    let lastKickState = false;

    // Direções pré-calculadas (evita cálculos em loop)
    const DIRECTIONS = {
        0: "d",    // direita
        1: "sd",   // sul-direita
        2: "s",    // sul
        3: "sa",   // sul-esquerda
        4: "a",    // esquerda
        5: "wa",   // norte-esquerda
        6: "w",    // norte
        7: "wd"    // norte-direita
    };

    const THRESHOLD_CENTER = 0.1;
    const THRESHOLD_MOTION = 0.5;

    /**
     * Converte coordenadas (x, y) para direção (0-7)
     * Otimizado: evita cálculos repetidos
     */
    function getDirection(x, y) {
        const angle = Math.atan2(y, x);
        const angleInDegrees = (angle >= 0 ? angle : 2 * Math.PI + angle) * (180 / Math.PI);
        return Math.round(angleInDegrees / 45) % 8;
    }

    /**
     * Emula teclas de movimento
     * Evita criar objetos novos
     */
    const keyState = { w: false, a: false, s: false, d: false };

    function emulateKeys(direction) {
        // Se não mudou, retorna cedo
        if (direction === lastJoystickDirection) return;
        lastJoystickDirection = direction;

        // Reset todos os estados
        keyState.w = false;
        keyState.a = false;
        keyState.s = false;
        keyState.d = false;

        // Seta nova direção
        if (direction === "") {
            dispatchKeyEvent("keyup", "KeyW");
            dispatchKeyEvent("keyup", "KeyA");
            dispatchKeyEvent("keyup", "KeyS");
            dispatchKeyEvent("keyup", "KeyD");
            return;
        }

        // Processa cada caractere da direção
        for (let i = 0; i < direction.length; i++) {
            const char = direction[i];
            keyState[char] = true;
            dispatchKeyEvent("keydown", `Key${char.toUpperCase()}`);
        }

        // Seta keyup para as teclas não pressionadas
        if (!keyState.w) dispatchKeyEvent("keyup", "KeyW");
        if (!keyState.a) dispatchKeyEvent("keyup", "KeyA");
        if (!keyState.s) dispatchKeyEvent("keyup", "KeyS");
        if (!keyState.d) dispatchKeyEvent("keyup", "KeyD");
    }

    /**
     * Dispara evento de teclado
     */
    function dispatchKeyEvent(type, code) {
        try {
            const gameFrame = document.querySelector('.gameframe')?.contentWindow;
            if (gameFrame?.document) {
                gameFrame.document.dispatchEvent(new KeyboardEvent(type, { code }));
            }
        } catch (e) {
            console.error("Erro ao disparar evento de teclado:", e);
        }
    }

    /**
     * Atualiza posição visual do joystick
     * Throttled para 60fps
     */
    const updateJoystickThrottled = PerfUtils.throttle(function(touch) {
        if (!joystick || !thumb) return;

        const rect = joystick.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const deltaX = touch.clientX - centerX;
        const deltaY = touch.clientY - centerY;

        const angle = Math.atan2(deltaY, deltaX);
        const distance = Math.min(
            joystick.clientWidth / 2,
            Math.hypot(deltaX, deltaY)
        );

        const thumbX = centerX + distance * Math.cos(angle);
        const thumbY = centerY + distance * Math.sin(angle);

        // GPU accelerated com transform
        thumb.style.transform = `translate(${thumbX - rect.left - thumb.clientWidth / 2}px, ${thumbY - rect.top - thumb.clientHeight / 2}px)`;

        const directionIndex = getDirection(deltaX, deltaY);
        emulateKeys(DIRECTIONS[directionIndex]);
    }, 16, "joystick-update"); // ~60fps

    function handleTouchStart(e) {
        if (!joystick) return;
        isTouching = true;
        updateJoystickThrottled(e.touches[0]);
    }

    function handleTouchMove(e) {
        if (!joystick || !isTouching) return;
        e.preventDefault(); // Evita scroll
        updateJoystickThrottled(e.touches[0]);
    }

    function handleTouchEnd() {
        isTouching = false;
        resetJoystick();
    }

    function resetJoystick() {
        if (!joystick || !thumb) return;

        thumb.style.transform = `translate(${joystick.clientWidth / 2 - thumb.clientWidth / 2}px, ${joystick.clientHeight / 2 - thumb.clientHeight / 2}px)`;
        emulateKeys("");
        lastJoystickDirection = "";
    }

    function kick(pressed) {
        if (pressed === lastKickState) return;
        lastKickState = pressed;
        dispatchKeyEvent(pressed ? "keydown" : "keyup", "KeyX");
    }

    function setup() {
        // Cria joystick
        joystick = document.createElement("div");
        joystick.setAttribute("class", "neo rounded sizer");
        joystick.setAttribute("view", "hidden");
        joystick.setAttribute("id", "joystick");
        joystick.innerHTML = '<div id="thumb" class="rounded" float></div>';

        thumb = joystick.querySelector("#thumb");

        // Event delegation com throttle
        joystick.addEventListener('touchstart', handleTouchStart);
        joystick.addEventListener('touchmove', handleTouchMove, { passive: false });
        joystick.addEventListener('touchend', handleTouchEnd);

        // Cria botão de chute
        kickButton = document.createElement("button");
        kickButton.setAttribute("class", "neo rounded sizer");
        kickButton.setAttribute("view", "hidden");
        kickButton.setAttribute("id", "kick");
        kickButton.innerHTML = '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512"><path d="M290 49c-16 0-32 14-38 36-6 25 5 48 22 52 18 5 39-10 45-35 7-25-5-48-22-52l-7-1zM89 68 78 87c32 24 52 51 59 83 6 27 5 53-6 77-10 23-28 41-50 51l12 19c28-12 50-35 63-63 14-30 15-64 6-99-8-33-27-63-64-93l-9-12z"/></svg>';

        kickButton.addEventListener('touchstart', () => kick(true));
        kickButton.addEventListener('touchend', () => kick(false));

        document.body.appendChild(joystick);
        document.body.appendChild(kickButton);

        resetJoystick();
    }

    function show(visible) {
        if (!joystick || !kickButton) return;
        const view = visible ? "visible" : "hidden";
        joystick.setAttribute("view", view);
        kickButton.setAttribute("view", view);
    }

    return {
        setup,
        show,
        reset: resetJoystick,
        kick,
        emulateKeys
    };
})();

// ============================================================================
// 5. GAMEPAD SUPPORT - Sem loops recursivos
// ============================================================================

const GamepadSystem = (() => {
    let gamepadAnimationId = null;
    let previousDirections = new Map(); // Rastreia estado anterior
    let isKickPressed = false;

    const GAMEPAD_THRESHOLD_CENTER = 0.1;
    const GAMEPAD_THRESHOLD_MOTION = 0.5;

    function getDirectionFromAxis(x, y) {
        if (Math.abs(x) < GAMEPAD_THRESHOLD_CENTER && Math.abs(y) < GAMEPAD_THRESHOLD_CENTER) {
            return "center";
        }
        if (Math.abs(x) > GAMEPAD_THRESHOLD_MOTION || Math.abs(y) > GAMEPAD_THRESHOLD_MOTION) {
            const angle = Math.atan2(y, x);
            const angleInDegrees = (angle >= 0 ? angle : 2 * Math.PI + angle) * (180 / Math.PI);
            const directions = ["d", "sd", "s", "sa", "a", "wa", "w", "wd"];
            return directions[Math.round(angleInDegrees / 45) % 8];
        }
        return null;
    }

    function pollGamepads() {
        const gamepads = navigator.getGamepads?.();
        if (!gamepads) return;

        for (let i = 0; i < gamepads.length; i++) {
            const gamepad = gamepads[i];
            if (!gamepad) continue;

            // Stick esquerdo (movimento)
            const leftDir = getDirectionFromAxis(gamepad.axes[0], gamepad.axes[1]);
            const prevLeftDir = previousDirections.get(`left-${i}`);
            if (leftDir !== prevLeftDir) {
                if (leftDir && leftDir !== "center") {
                    ControlSystem.emulateKeys?.(leftDir);
                } else {
                    ControlSystem.emulateKeys?.("");
                }
                previousDirections.set(`left-${i}`, leftDir);
            }

            // Botões de chute (A e X buttons)
            const buttonPressed = gamepad.buttons[0]?.pressed || gamepad.buttons[2]?.pressed;
            if (buttonPressed !== isKickPressed) {
                ControlSystem.kick?.(buttonPressed);
                isKickPressed = buttonPressed;
            }
        }

        gamepadAnimationId = requestAnimationFrame(pollGamepads);
    }

    function start() {
        if (!gamepadAnimationId) {
            gamepadAnimationId = requestAnimationFrame(pollGamepads);
        }
    }

    function stop() {
        if (gamepadAnimationId) {
            cancelAnimationFrame(gamepadAnimationId);
            gamepadAnimationId = null;
        }
    }

    window.addEventListener("gamepadconnected", () => {
        console.log("[HaxZero] Gamepad conectado");
        start();
    });

    window.addEventListener("gamepaddisconnected", () => {
        console.log("[HaxZero] Gamepad desconectado");
    });

    return { start, stop };
})();

// ============================================================================
// 6. UI MANAGER - Observa mudanças sem overhead
// ============================================================================

const UIManager = (() => {
    let observer = null;
    let lastViewState = null;

    const VIEW_STATES = {
        LOADING: "loading",
        NICKNAME: "nickname",
        ROOMLIST: "roomlist",
        CREATE_ROOM: "create_room",
        SETTINGS: "settings",
        GAME: "game",
        ADMIN: "admin",
        CAPTCHA: "captcha",
        UNKNOWN: "unknown"
    };

    /**
     * Detecta view atual
     * Otimizado: evita múltiplas queries
     */
    function detectViewState(body) {
        if (!body) return VIEW_STATES.UNKNOWN;

        if (body.querySelector('.loader-view')) return VIEW_STATES.LOADING;
        if (body.querySelector('.choose-nickname-view')) return VIEW_STATES.NICKNAME;
        if (body.querySelector('.roomlist-view')) return VIEW_STATES.ROOMLIST;
        if (body.querySelector('.create-room-view')) return VIEW_STATES.CREATE_ROOM;
        if (body.querySelector('.settings-view')) return VIEW_STATES.SETTINGS;
        if (body.querySelector('.g-recaptcha-response')) return VIEW_STATES.CAPTCHA;
        if (body.querySelector('.game-view')) {
            if (body.querySelector('.room-view')) return VIEW_STATES.GAME;
            if (body.querySelector('.room-link-view')) return VIEW_STATES.ADMIN;
            return VIEW_STATES.ADMIN;
        }

        return VIEW_STATES.UNKNOWN;
    }

    /**
     * Processa mudanças de view
     */
    function updateUI(body) {
        const currentView = detectViewState(body);

        if (currentView === lastViewState) return;
        lastViewState = currentView;

        console.log(`[HaxZero] View changed: ${currentView}`);

        // Dispatch de eventos por view
        switch (currentView) {
            case VIEW_STATES.GAME:
                ControlSystem.show(true);
                GamepadSystem.start();
                break;
            case VIEW_STATES.NICKNAME:
            case VIEW_STATES.ROOMLIST:
            case VIEW_STATES.SETTINGS:
                ControlSystem.show(false);
                GamepadSystem.stop();
                break;
            case VIEW_STATES.CAPTCHA:
                ControlSystem.show(false);
                GamepadSystem.stop();
                break;
        }
    }

    /**
     * Throttled update para evitar múltiplas execuções
     */
    const updateUIThrottled = PerfUtils.throttle(updateUI, 100, "ui-update");

    function init(body) {
        if (!body) return;

        // Mutation Observer otimizado: subtree: false
        const config = { childList: true, subtree: false };
        observer = new MutationObserver(() => {
            updateUIThrottled(body);
        });

        observer.observe(body, config);
        updateUI(body); // Primeira execução
    }

    function destroy() {
        if (observer) {
            observer.disconnect();
            observer = null;
        }
    }

    return { init, destroy, detectViewState, VIEW_STATES };
})();

// ============================================================================
// 7. INITIALIZATION
// ============================================================================

const HaxZero = (() => {
    let isInitialized = false;
    let initAttempts = 0;
    const MAX_INIT_ATTEMPTS = 30; // 30 segundos max

    function init() {
        if (isInitialized) return;

        const gameFrame = document.querySelector('.gameframe')?.contentWindow;
        if (!gameFrame?.document.body) {
            initAttempts++;
            if (initAttempts > MAX_INIT_ATTEMPTS) {
                console.error("[HaxZero] Falha ao inicializar após 30s");
                return;
            }
            setTimeout(init, 1000);
            return;
        }

        try {
            console.log("[HaxZero] Inicializando...");

            // Remove ads
            try {
                document.querySelector('.rightbar')?.remove();
                document.querySelector('.header')?.remove();
            } catch (e) {
                console.warn("[HaxZero] Erro ao remover ads:", e);
            }

            // Setup
            DOMCache.init(gameFrame);
            DOMCache.setBody(gameFrame.document.body.children[0]);
            ControlSystem.setup();
            UIManager.init(gameFrame.document.body.children[0]);

            // Viewport otimizado
            const viewport = document.querySelector("meta[name=viewport]");
            if (viewport) {
                viewport.setAttribute('content', 
                    'width=device-width, initial-scale=1, maximum-scale=1, minimum-scale=1, user-scalable=0');
            }

            isInitialized = true;
            console.log("[HaxZero] ✅ Inicializado com sucesso!");
            console.log("[HaxZero] 📊 Monitore performance no DevTools");
        } catch (e) {
            console.error("[HaxZero] Erro durante inicialização:", e);
            isInitialized = false;
            initAttempts++;
            if (initAttempts <= MAX_INIT_ATTEMPTS) {
                setTimeout(init, 1000);
            }
        }
    }

    return { init };
})();

// ============================================================================
// 8. AUTO-START
// ============================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', HaxZero.init);
} else {
    HaxZero.init();
}

console.log("[HaxZero] v1.0 - Script carregado");