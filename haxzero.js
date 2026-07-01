/**
 * HaxZero - High Performance Haxball Mobile Client
 * Otimizado para Android com Injector | Latência mínima | Zero travamentos
 * 
 * Arquitetura:
 * - Detecção automática de ambiente (Injector vs Browser)
 * - Joystick overlay fullscreen
 * - Object Pool para reduzir GC
 * - Throttle/Debounce para eventos
 */

// ============================================================================
// 1. DETECÇÃO DE AMBIENTE
// ============================================================================

const ENV = (() => {
    const isInjector = typeof window.injector !== 'undefined' || 
                      typeof window.sendMessage !== 'undefined' ||
                      navigator.userAgent.includes('HaxBall');
    
    const isMobile = /Android|iPhone|iPad|iPod/.test(navigator.userAgent);
    
    console.log(`[HaxZero] Ambiente: ${isInjector ? 'Injector' : 'Browser'} | Mobile: ${isMobile}`);
    
    return { isInjector, isMobile };
})();

// ============================================================================
// 2. PERFORMANCE UTILITIES
// ============================================================================

const PerfUtils = (() => {
    const throttledFunctions = new Map();

    function throttle(fn, delay, id) {
        if (!throttledFunctions.has(id)) {
            let lastCall = 0;
            let rafId = null;
            
            throttledFunctions.set(id, function(...args) {
                const now = performance.now();
                
                if (rafId) cancelAnimationFrame(rafId);
                
                if (now - lastCall >= delay) {
                    lastCall = now;
                    fn.apply(this, args);
                } else {
                    rafId = requestAnimationFrame(() => {
                        lastCall = performance.now();
                        fn.apply(this, args);
                    });
                }
            });
        }
        return throttledFunctions.get(id);
    }

    return { throttle };
})();

// ============================================================================
// 3. VIRTUAL JOYSTICK - Otimizado para Touch
// ============================================================================

const VirtualJoystick = (() => {
    let container = null;
    let joystick = null;
    let thumb = null;
    let kickButton = null;
    let isTouching = false;
    
    let lastDirection = "";
    let lastKickState = false;

    const DIRECTIONS = ["d", "sd", "s", "sa", "a", "wa", "w", "wd"];
    const DEAD_ZONE = 0.15;

    function createUI() {
        // Container principal
        container = document.createElement("div");
        container.id = "haxzero-controls";
        container.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100%;
            height: 100%;
            pointer-events: none;
            z-index: 9999;
        `;

        // Joystick (esquerda)
        joystick = document.createElement("div");
        joystick.id = "haxzero-joystick";
        joystick.style.cssText = `
            position: absolute;
            bottom: 20px;
            left: 20px;
            width: 120px;
            height: 120px;
            border-radius: 50%;
            background: rgba(100, 150, 200, 0.3);
            border: 2px solid rgba(100, 150, 200, 0.6);
            pointer-events: auto;
            touch-action: none;
            display: none;
        `;

        thumb = document.createElement("div");
        thumb.style.cssText = `
            position: absolute;
            width: 50px;
            height: 50px;
            border-radius: 50%;
            background: rgba(150, 180, 220, 0.7);
            border: 2px solid rgba(150, 180, 220, 0.9);
            top: 50%;
            left: 50%;
            transform: translate(-50%, -50%);
            pointer-events: none;
        `;
        joystick.appendChild(thumb);

        // Kick Button (direita)
        kickButton = document.createElement("button");
        kickButton.id = "haxzero-kick";
        kickButton.innerHTML = "⚽";
        kickButton.style.cssText = `
            position: absolute;
            bottom: 20px;
            right: 20px;
            width: 100px;
            height: 100px;
            border-radius: 50%;
            background: rgba(220, 100, 100, 0.3);
            border: 2px solid rgba(220, 100, 100, 0.6);
            font-size: 50px;
            pointer-events: auto;
            touch-action: none;
            cursor: pointer;
            display: none;
            padding: 0;
            user-select: none;
            -webkit-user-select: none;
        `;

        container.appendChild(joystick);
        container.appendChild(kickButton);
        document.body.appendChild(container);
    }

    function getDirection(x, y) {
        if (Math.abs(x) < DEAD_ZONE && Math.abs(y) < DEAD_ZONE) {
            return "";
        }
        
        const angle = Math.atan2(y, x);
        const angleInDegrees = (angle >= 0 ? angle : 2 * Math.PI + angle) * (180 / Math.PI);
        const index = Math.round(angleInDegrees / 45) % 8;
        return DIRECTIONS[index];
    }

    const updateJoystickThrottled = PerfUtils.throttle(function(touch) {
        if (!joystick || !thumb) return;

        const rect = joystick.getBoundingClientRect();
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const deltaX = touch.clientX - centerX;
        const deltaY = touch.clientY - centerY;
        
        const distance = Math.min(
            joystick.clientWidth / 2,
            Math.hypot(deltaX, deltaY)
        );
        
        const angle = Math.atan2(deltaY, deltaX);
        const thumbX = distance * Math.cos(angle);
        const thumbY = distance * Math.sin(angle);

        thumb.style.transform = `translate(calc(-50% + ${thumbX}px), calc(-50% + ${thumbY}px))`;

        const direction = getDirection(deltaX, deltaY);
        if (direction !== lastDirection) {
            lastDirection = direction;
            emulateKeys(direction);
        }
    }, 16, "joystick-update");

    function emulateKeys(direction) {
        const keyMap = {
            'w': { code: 'KeyW', event: direction.includes('w') ? 'keydown' : 'keyup' },
            'a': { code: 'KeyA', event: direction.includes('a') ? 'keydown' : 'keyup' },
            's': { code: 'KeyS', event: direction.includes('s') ? 'keydown' : 'keyup' },
            'd': { code: 'KeyD', event: direction.includes('d') ? 'keydown' : 'keyup' }
        };

        for (const [key, { code, event }] of Object.entries(keyMap)) {
            dispatchKeyEvent(event, code);
        }
    }

    function dispatchKeyEvent(type, code) {
        try {
            document.dispatchEvent(new KeyboardEvent(type, { code, bubbles: true }));
        } catch (e) {
            console.error("Erro ao disparar evento:", e);
        }
    }

    function handleTouchStart(e) {
        isTouching = true;
        updateJoystickThrottled(e.touches[0]);
    }

    function handleTouchMove(e) {
        if (!isTouching) return;
        e.preventDefault();
        updateJoystickThrottled(e.touches[0]);
    }

    function handleTouchEnd() {
        isTouching = false;
        thumb.style.transform = `translate(-50%, -50%)`;
        emulateKeys("");
        lastDirection = "";
    }

    function handleKickStart() {
        if (lastKickState) return;
        lastKickState = true;
        dispatchKeyEvent('keydown', 'KeyX');
    }

    function handleKickEnd() {
        if (!lastKickState) return;
        lastKickState = false;
        dispatchKeyEvent('keyup', 'KeyX');
    }

    function setup() {
        createUI();
        
        joystick.addEventListener('touchstart', handleTouchStart, { passive: false });
        joystick.addEventListener('touchmove', handleTouchMove, { passive: false });
        joystick.addEventListener('touchend', handleTouchEnd, { passive: false });
        
        kickButton.addEventListener('touchstart', handleKickStart, { passive: false });
        kickButton.addEventListener('touchend', handleKickEnd, { passive: false });
        kickButton.addEventListener('mousedown', handleKickStart);
        kickButton.addEventListener('mouseup', handleKickEnd);

        show(false);
    }

    function show(visible) {
        if (!joystick || !kickButton) return;
        joystick.style.display = visible ? 'block' : 'none';
        kickButton.style.display = visible ? 'block' : 'none';
    }

    return { setup, show, emulateKeys: (dir) => emulateKeys(dir) };
})();

// ============================================================================
// 4. SCREEN STATE DETECTOR - Detecta quando está em jogo
// ============================================================================

const ScreenDetector = (() => {
    let isInGame = false;
    let lastDetection = 0;
    const DETECTION_INTERVAL = 500; // 500ms

    function detect() {
        const now = performance.now();
        if (now - lastDetection < DETECTION_INTERVAL) return isInGame;
        lastDetection = now;

        // Detecta tela de jogo procurando elementos específicos
        const indicators = [
            document.querySelector('canvas'),
            document.querySelector('[class*="game"]'),
            document.querySelector('[class*="score"]'),
            document.querySelector('[class*="timer"]')
        ];

        const detectedGame = indicators.some(el => el !== null);

        if (detectedGame !== isInGame) {
            isInGame = detectedGame;
            console.log(`[HaxZero] Tela: ${isInGame ? 'JOGO' : 'MENU'}`);
            VirtualJoystick.show(isInGame);
        }

        return isInGame;
    }

    function start() {
        setInterval(detect, DETECTION_INTERVAL);
    }

    return { start, detect, isInGame: () => isInGame };
})();

// ============================================================================
// 5. GAME LOOP - Mantém o joystick sincronizado
// ============================================================================

const GameLoop = (() => {
    let rafId = null;

    function loop() {
        ScreenDetector.detect();
        rafId = requestAnimationFrame(loop);
    }

    function start() {
        if (!rafId) {
            rafId = requestAnimationFrame(loop);
        }
    }

    function stop() {
        if (rafId) {
            cancelAnimationFrame(rafId);
            rafId = null;
        }
    }

    return { start, stop };
})();

// ============================================================================
// 6. INITIALIZATION
// ============================================================================

const HaxZero = (() => {
    let initialized = false;

    function init() {
        if (initialized) return;

        try {
            console.log("[HaxZero] v1.1 - Inicializando...");
            
            VirtualJoystick.setup();
            ScreenDetector.start();
            GameLoop.start();

            // Previne saída acidental
            window.addEventListener('beforeunload', (e) => {
                if (ScreenDetector.isInGame()) {
                    e.preventDefault();
                    e.returnValue = '';
                }
            });

            initialized = true;
            console.log("[HaxZero] ✅ Inicializado com sucesso!");
            console.log("[HaxZero] 🎮 Joystick overlay ativado!");
            console.log("[HaxZero] 📍 Esquerda: Movimento | Direita: Chute");
        } catch (e) {
            console.error("[HaxZero] Erro na inicialização:", e);
        }
    }

    return { init };
})();

// ============================================================================
// 7. AUTO-START
// ============================================================================

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', HaxZero.init);
} else {
    HaxZero.init();
}

console.log("[HaxZero] v1.1 - Script carregado");
