// --- Configurações Iniciais e Estado ---
const STORAGE_KEY = 'inventario_codigos';
const STORAGE_HISTORY_KEY = 'inventario_historico_contados';
const STORAGE_LOOKUP_KEY = 'inventario_ean_lookup_db';
const WEBHOOK_URL = 'https://script.google.com/macros/s/AKfycbzmT2-y7yFsZr9U43x_uvf8yth60r2GXE5Itk-s0P73YEnSFbVcC5mCTN5BSKdsJxcnwg/exec';

// Catálogo Base Inicial
const INITIAL_EAN_CATALOG = {
    '7891129224049': 'CRC08CBANA',
    '7891129134959': 'CRC08CBANA',
    '511123224049': 'CRC08CBANA',
    '5501129224049': 'CRC08CBANA',
    'CT05CBB2232768': 'CRT05CBBNA'
};

let eanLookupDB = {};
let scannedHistory = { patrimonios: {}, series: {} };

let html5QrCode = null;
let isScanning = false;
let isFlashlightOn = false;
let isSoundEnabled = true;
let currentCameraId = null;
let availableRearCameras = [];
let currentCameraIndex = 0;
let scannedItems = [];
let editingItemId = null; // Guardar ID quando estiver editando um item existente

// Prevenir leituras repetidas e frenéticas do mesmo código
let lastScannedText = '';
let lastScanTime = 0;
let isCoolingDown = false; // Bloqueio global de 2s após leitura

// Contexto de Áudio Web para Beep Sonoro
let audioCtx = null;

// Elementos da UI
const btnToggleScanner = document.getElementById('btn-toggle-scanner');
const toggleScannerText = document.getElementById('toggle-scanner-text');
const btnToggleFlash = document.getElementById('btn-toggle-flash');
const btnSwitchCamera = document.getElementById('btn-switch-camera');
const btnToggleSound = document.getElementById('btn-toggle-sound');
const soundIcon = document.getElementById('sound-icon');
const scanFeedback = document.getElementById('scan-feedback');
const feedbackText = document.getElementById('feedback-text');
const btnCloseFeedback = document.getElementById('btn-close-feedback');
const screenFlashOverlay = document.getElementById('screen-flash-overlay');

const stickyStatusBar = document.getElementById('sticky-status-bar');
const statusBarIcon = document.getElementById('status-bar-icon');
const statusBarText = document.getElementById('status-bar-text');
const modeloBadge = document.getElementById('modelo-badge');

const formDuplicateAlert = document.getElementById('form-duplicate-alert');
const formDuplicateTitle = document.getElementById('form-duplicate-title');
const formDuplicateDesc = document.getElementById('form-duplicate-desc');
const btnDismissDuplicateAlert = document.getElementById('btn-dismiss-duplicate-alert');

const itemsListEl = document.getElementById('items-list');
const totalCountEl = document.getElementById('total-count');
const uniqueCountEl = document.getElementById('unique-count');
const btnExport = document.getElementById('btn-export');
const btnCopy = document.getElementById('btn-copy');
const btnClear = document.getElementById('btn-clear');
const searchInput = document.getElementById('search-input');
const btnSyncAll = document.getElementById('btn-sync-all');

// Elementos do Formulário Atual
const inputPatrimonio = document.getElementById('current-patrimonio');
const inputModelo = document.getElementById('current-modelo');
const inputSerie = document.getElementById('current-serie');
const inputEan = document.getElementById('current-ean');
const inputObs = document.getElementById('current-obs');
const inputQty = document.getElementById('current-qty');
const btnSaveItem = document.getElementById('btn-save-item');
const btnResetForm = document.getElementById('btn-reset-form');
const formTitle = document.getElementById('form-title');
const saveBtnText = document.getElementById('save-btn-text');
const saveIcon = document.getElementById('save-icon');

// --- Inicialização ---
document.addEventListener('DOMContentLoaded', () => {
    loadLookupDB();
    loadHistory();
    loadItems();
    renderList();
    setupEventListeners();
    updateGlobalSyncStatus();
    fetchDataFromGoogleSheet(); // Puxa todos os itens e modelos da planilha em tempo real
});

function setupEventListeners() {
    btnToggleScanner.addEventListener('click', toggleScanner);
    btnToggleFlash.addEventListener('click', toggleFlashlight);
    btnSwitchCamera.addEventListener('click', switchCamera);
    btnToggleSound.addEventListener('click', toggleSound);
    btnExport.addEventListener('click', exportCSV);
    btnCopy.addEventListener('click', copyToClipboard);
    btnClear.addEventListener('click', clearItems);
    btnSaveItem.addEventListener('click', saveCurrentItem);
    btnResetForm.addEventListener('click', resetForm);
    searchInput.addEventListener('input', renderList);
    
    // Auto-preenchimento ao digitar ou colar no campo EAN
    inputEan.addEventListener('input', () => {
        const val = inputEan.value.trim();
        if (val && eanLookupDB[val]) {
            inputModelo.value = eanLookupDB[val];
            inputModelo.classList.add('highlight-autofill');
            if (modeloBadge) modeloBadge.style.display = 'inline-flex';
            setTimeout(() => inputModelo.classList.remove('highlight-autofill'), 1500);
        }
    });
    
    if (btnSyncAll) {
        btnSyncAll.addEventListener('click', syncAllPending);
    }
    
    if (btnCloseFeedback) {
        btnCloseFeedback.addEventListener('click', dismissDuplicateAlerts);
    }
    
    if (btnDismissDuplicateAlert) {
        btnDismissDuplicateAlert.addEventListener('click', dismissDuplicateAlerts);
    }
    
    if (stickyStatusBar) {
        stickyStatusBar.addEventListener('click', () => {
            const hasPending = scannedItems.some(i => !i.synced);
            if (hasPending && navigator.onLine) {
                syncAllPending();
            }
        });
    }
    
    // Listeners de Conexão (Internet)
    window.addEventListener('online', () => {
        updateGlobalSyncStatus();
        fetchDataFromGoogleSheet();
        syncAllPending(); // Tenta sincronizar automaticamente ao voltar a internet
    });
    window.addEventListener('offline', updateGlobalSyncStatus);
}

// --- Funções de Áudio (Beep) ---
function playBeepSound() {
    if (!isSoundEnabled) return;
    
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        
        osc.type = 'sine';
        osc.frequency.setValueAtTime(1800, audioCtx.currentTime); // Frequência aguda de beep
        gain.gain.setValueAtTime(0.1, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.12);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        
        osc.start();
        osc.stop(audioCtx.currentTime + 0.12);
    } catch (e) {
        console.warn("Áudio não suportado ou bloqueado", e);
    }
}

function playWarningSound() {
    if (!isSoundEnabled) return;
    try {
        if (!audioCtx) {
            audioCtx = new (window.AudioContext || window.webkitAudioContext)();
        }
        if (audioCtx.state === 'suspended') {
            audioCtx.resume();
        }
        
        const osc = audioCtx.createOscillator();
        const gain = audioCtx.createGain();
        osc.type = 'sawtooth';
        osc.frequency.setValueAtTime(350, audioCtx.currentTime);
        osc.frequency.setValueAtTime(200, audioCtx.currentTime + 0.15);
        gain.gain.setValueAtTime(0.2, audioCtx.currentTime);
        gain.gain.exponentialRampToValueAtTime(0.00001, audioCtx.currentTime + 0.35);
        
        osc.connect(gain);
        gain.connect(audioCtx.destination);
        osc.start();
        osc.stop(audioCtx.currentTime + 0.35);
    } catch (e) {
        console.warn("Áudio não suportado", e);
    }
}

function toggleSound() {
    isSoundEnabled = !isSoundEnabled;
    if (isSoundEnabled) {
        btnToggleSound.classList.remove('btn-secondary');
        btnToggleSound.classList.add('btn-primary');
        soundIcon.className = 'fa-solid fa-volume-high';
        playBeepSound();
    } else {
        btnToggleSound.classList.remove('btn-primary');
        btnToggleSound.classList.add('btn-secondary');
        soundIcon.className = 'fa-solid fa-volume-xmark';
    }
}

// --- Funções da Câmera / Leitor ---
async function toggleScanner() {
    if (isScanning) {
        await stopScanner();
    } else {
        await startScanner();
    }
}

async function startScanner() {
    try {
        if (!html5QrCode) {
            html5QrCode = new Html5Qrcode("reader");
        }

        const config = { 
            fps: 20, 
            qrbox: { width: 300, height: 150 },
            aspectRatio: 1.0,
            formatsToSupport: [
                Html5QrcodeSupportedFormats.QR_CODE,
                Html5QrcodeSupportedFormats.EAN_13,
                Html5QrcodeSupportedFormats.CODE_128,
                Html5QrcodeSupportedFormats.CODE_39
            ]
        };

        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length) {
            // Filtrar apenas câmeras traseiras (descartando frontal/user)
            availableRearCameras = devices.filter(d => {
                const label = (d.label || '').toLowerCase();
                return !label.includes('front') && !label.includes('user') && !label.includes('selfie');
            });

            if (availableRearCameras.length === 0) {
                availableRearCameras = devices; // Fallback
            }

            // Habilitar botão de alternar câmera se houver mais de uma
            btnSwitchCamera.disabled = (availableRearCameras.length <= 1);

            // Selecionar câmera principal (1x) evitando ultrawide/0.5x na escolha inicial
            if (!currentCameraId) {
                const mainCam = availableRearCameras.find(d => {
                    const l = (d.label || '').toLowerCase();
                    return (l.includes('back') || l.includes('rear') || l.includes('0') || l.includes('main')) && 
                           !l.includes('ultra') && !l.includes('wide-angle') && !l.includes('0.5');
                });
                
                const selected = mainCam || availableRearCameras[0];
                currentCameraId = selected.id;
                currentCameraIndex = availableRearCameras.findIndex(d => d.id === currentCameraId);
                if (currentCameraIndex < 0) currentCameraIndex = 0;
            }
            
            await html5QrCode.start(
                currentCameraId ? { deviceId: { exact: currentCameraId } } : { facingMode: "environment" }, 
                config, 
                onScanSuccess, 
                onScanFailure
            );
            
            isScanning = true;
            toggleScannerText.innerText = 'Parar Câmera';
            btnToggleScanner.classList.remove('btn-primary');
            btnToggleScanner.classList.add('btn-danger');
            btnToggleScanner.innerHTML = '<i class="fa-solid fa-stop"></i> <span id="toggle-scanner-text">Parar Câmera</span>';
            
            checkFlashlightSupport();
        } else {
            alert('Nenhuma câmera encontrada no dispositivo.');
        }
    } catch (err) {
        console.error("Erro ao iniciar a câmera", err);
        alert('Erro ao acessar a câmera. Verifique as permissões. Detalhes: ' + err);
    }
}

async function switchCamera() {
    if (availableRearCameras.length <= 1) return;
    
    currentCameraIndex = (currentCameraIndex + 1) % availableRearCameras.length;
    currentCameraId = availableRearCameras[currentCameraIndex].id;
    
    if (isScanning) {
        await stopScanner();
        await startScanner();
    }
}

async function stopScanner() {
    if (html5QrCode && isScanning) {
        try {
            await html5QrCode.stop();
            isScanning = false;
            isFlashlightOn = false;
            
            btnToggleScanner.classList.remove('btn-danger');
            btnToggleScanner.classList.add('btn-primary');
            btnToggleScanner.innerHTML = '<i class="fa-solid fa-camera"></i> <span id="toggle-scanner-text">Iniciar Câmera</span>';
            
            btnToggleFlash.disabled = true;
            btnToggleFlash.classList.remove('btn-primary');
            btnToggleFlash.classList.add('btn-secondary');
            
        } catch (err) {
            console.error("Erro ao parar a câmera", err);
        }
    }
}

// --- Helpers de Histórico e Auto-Aprendizado (Lookup) ---

function loadLookupDB() {
    try {
        const saved = localStorage.getItem(STORAGE_LOOKUP_KEY);
        const parsed = saved ? JSON.parse(saved) : {};
        eanLookupDB = { ...INITIAL_EAN_CATALOG, ...parsed };
    } catch (e) {
        eanLookupDB = { ...INITIAL_EAN_CATALOG };
    }
}

function learnEanModel(ean, modelo) {
    if (!ean || !modelo) return;
    ean = ean.trim();
    modelo = modelo.trim();
    if (!ean || !modelo) return;
    
    if (eanLookupDB[ean] !== modelo) {
        eanLookupDB[ean] = modelo;
        try {
            localStorage.setItem(STORAGE_LOOKUP_KEY, JSON.stringify(eanLookupDB));
            console.log(`[Auto-Aprendizado] EAN ${ean} -> Modelo ${modelo}`);
        } catch (e) {
            console.error("Erro ao salvar auto-aprendizado", e);
        }
    }
}

function loadHistory() {
    try {
        const saved = localStorage.getItem(STORAGE_HISTORY_KEY);
        scannedHistory = saved ? JSON.parse(saved) : { patrimonios: {}, series: {} };
        if (!scannedHistory.patrimonios) scannedHistory.patrimonios = {};
        if (!scannedHistory.series) scannedHistory.series = {};
    } catch (e) {
        scannedHistory = { patrimonios: {}, series: {} };
    }
}

function saveHistory() {
    try {
        localStorage.setItem(STORAGE_HISTORY_KEY, JSON.stringify(scannedHistory));
    } catch (e) {
        console.error("Erro ao salvar histórico", e);
    }
}

// Puxa toda a base da planilha do Google Sheets para o histórico e catálogo local
async function fetchDataFromGoogleSheet() {
    if (!WEBHOOK_URL) return;
    try {
        const response = await fetch(WEBHOOK_URL);
        if (!response.ok) return;
        const result = await response.json();
        if (result && result.status === 'sucesso' && Array.isArray(result.data)) {
            let loadedDuplicates = 0;
            let loadedModels = 0;
            
            result.data.forEach(item => {
                // 1. Carrega no histórico de duplicidades
                if (item.patrimonio) {
                    const normPat = item.patrimonio.trim().toUpperCase();
                    if (!scannedHistory.patrimonios[normPat]) {
                        scannedHistory.patrimonios[normPat] = true;
                        loadedDuplicates++;
                    }
                }
                if (item.serie) {
                    const normSer = item.serie.trim().toUpperCase();
                    if (!scannedHistory.series[normSer]) {
                        scannedHistory.series[normSer] = true;
                        loadedDuplicates++;
                    }
                }
                
                // 2. Aprende novos EAN -> Modelo diretamente da planilha
                if (item.ean && item.modelo) {
                    const eanClean = String(item.ean).trim();
                    const modeloClean = String(item.modelo).trim();
                    if (eanClean && modeloClean && !eanLookupDB[eanClean]) {
                        eanLookupDB[eanClean] = modeloClean;
                        loadedModels++;
                    }
                }
            });
            
            saveHistory();
            localStorage.setItem(STORAGE_LOOKUP_KEY, JSON.stringify(eanLookupDB));
            console.log(`[Google Sheets Nuvem] ${result.data.length} itens sincronizados da planilha para proteção de duplicidade e lookup.`);
        }
    } catch (err) {
        console.warn("Aviso: Não foi possível carregar planilha em segundo plano (offline ou método GET não configurado no Apps Script):", err);
    }
}

function checkDuplicateCode(patrimonio, serie) {
    if (!patrimonio && !serie) return null;
    
    if (patrimonio) {
        const normPat = patrimonio.trim().toUpperCase();
        const inList = scannedItems.find(i => i.patrimonio && i.patrimonio.trim().toUpperCase() === normPat);
        if (inList) return `Patrimônio ${patrimonio} já está na lista atual!`;
        if (scannedHistory.patrimonios && scannedHistory.patrimonios[normPat]) {
            return `Patrimônio ${patrimonio} já foi bipado anteriormente!`;
        }
    }
    
    if (serie) {
        const normSer = serie.trim().toUpperCase();
        const inList = scannedItems.find(i => i.serie && i.serie.trim().toUpperCase() === normSer);
        if (inList) return `Nº de Série ${serie} já está na lista atual!`;
        if (scannedHistory.series && scannedHistory.series[normSer]) {
            return `Nº de Série ${serie} já foi bipado anteriormente!`;
        }
    }
    
    return null;
}

function onScanSuccess(decodedText, decodedResult) {
    if (isCoolingDown) return;

    // Ao iniciar uma nova leitura, limpa qualquer alerta de duplicidade antigo
    dismissDuplicateAlerts();

    const now = Date.now();
    // Debounce de 1.5s para o exato mesmo código
    if (decodedText === lastScannedText && (now - lastScanTime) < 1500) {
        return;
    }
    
    lastScannedText = decodedText;
    lastScanTime = now;
    
    decodedText = decodedText.trim();

    // Verifica se o usuário clicou/focou em algum campo específico
    const activeEl = document.activeElement;
    const isTargetingInput = activeEl && (
        activeEl === inputPatrimonio || 
        activeEl === inputModelo || 
        activeEl === inputSerie || 
        activeEl === inputEan || 
        activeEl === inputObs
    );

    let typeFound = 'Código capturado!';
    let detectedPatrimonio = '';
    let detectedSerie = '';
    let isAutofilled = false;

    if (isTargetingInput) {
        // Se o usuário selecionou um campo, joga o valor diretamente nele
        const previousValue = activeEl.value;
        activeEl.value = previousValue ? previousValue + ' ' + decodedText : decodedText;
        typeFound = 'Código inserido no campo selecionado!';
        
        if (activeEl === inputPatrimonio) detectedPatrimonio = activeEl.value;
        if (activeEl === inputSerie) detectedSerie = activeEl.value;
        
        // Se o usuário clicou no campo EAN e bipou, TAMBÉM aciona o auto-preenchimento de Modelo!
        if (activeEl === inputEan) {
            const eanClean = activeEl.value.trim();
            if (eanLookupDB[eanClean]) {
                inputModelo.value = eanLookupDB[eanClean];
                inputModelo.classList.add('highlight-autofill');
                if (modeloBadge) modeloBadge.style.display = 'inline-flex';
                setTimeout(() => inputModelo.classList.remove('highlight-autofill'), 1500);
                typeFound = `✨ EAN inserido e Modelo "${eanLookupDB[eanClean]}" preenchido automaticamente!`;
            }
        }
    } else {
        // =========================================
        // PARSER INTELIGENTE DE CÓDIGOS DE BARRAS
        // =========================================
        
        // 1. Regra Patrimônio (ex: 035.03.232)
        const patrimonioRegex = /^\d{3}\.\d{2}\.\d{3}$/;
        
        // 2. Regra EAN (8 a 14 dígitos)
        const eanRegex = /^\d{8,14}$/;
        
        // 3. Regra Consul / Código Composto (ex: CRC08CBANAJJ6584955E3)
        const consulRegex = /^(CRC[A-Z0-9]{7})([A-Z0-9]{9})(.*)$/i;
        
        // 4. Regra Elgin - Série (começa com ARC)
        const elginSerieRegex = /^ARC\d+$/i;
        
        // 5. Regra Elgin - Modelo (começa com KVF, etc)
        const elginModeloRegex = /^KVF[A-Z0-9]+$/i;

        if (patrimonioRegex.test(decodedText)) {
            inputPatrimonio.value = decodedText;
            detectedPatrimonio = decodedText;
            typeFound = 'QR Code de Patrimônio lido!';
            
        } else if (consulRegex.test(decodedText)) {
            const match = decodedText.match(consulRegex);
            inputModelo.value = match[1]; // Modelo
            inputSerie.value = match[2];  // Série
            detectedSerie = match[2];
            if (match[3]) {
                const currentObs = inputObs.value;
                inputObs.value = currentObs ? currentObs + ' / Lote: ' + match[3] : 'Lote: ' + match[3];
            }
            typeFound = 'Modelo e Série Consul identificados!';
            
        } else if (elginSerieRegex.test(decodedText)) {
            inputSerie.value = decodedText;
            detectedSerie = decodedText;
            typeFound = 'Série Elgin identificada!';
            
        } else if (elginModeloRegex.test(decodedText)) {
            inputModelo.value = decodedText;
            typeFound = 'Modelo Elgin identificado!';
            
        } else if (eanRegex.test(decodedText)) {
            inputEan.value = decodedText;
            typeFound = 'EAN lido!';
            
            // Auto-preencher o modelo se existir na nossa base inteligente (Lookup)
            if (eanLookupDB[decodedText]) {
                inputModelo.value = eanLookupDB[decodedText];
                isAutofilled = true;
                typeFound = `✨ EAN lido! Modelo "${eanLookupDB[decodedText]}" preenchido!`;
                
                inputModelo.classList.add('highlight-autofill');
                if (modeloBadge) modeloBadge.style.display = 'inline-flex';
                setTimeout(() => inputModelo.classList.remove('highlight-autofill'), 1500);
            } else {
                if (modeloBadge) modeloBadge.style.display = 'none';
                typeFound = 'EAN lido! Digite o modelo 1x para o app aprender.';
            }
            
        } else {
            // Fallback: se não se encaixa nas regras, joga na observação
            const currentObs = inputObs.value;
            inputObs.value = currentObs ? currentObs + ' / Código genérico lido: ' + decodedText : 'Lido: ' + decodedText;
            typeFound = 'Código desconhecido (jogado na Observação)';
        }
    }
    
    // --- Verificação Instantânea de Duplicidade na Leitura ---
    const duplicateWarning = checkDuplicateCode(detectedPatrimonio, detectedSerie);
    if (duplicateWarning) {
        showWarningFeedback(`⚠️ DUPLICIDADE DETECTADA`, duplicateWarning);
    } else {
        feedbackText.innerText = typeFound;
        playBeepSound();
        showFeedback();
        if (navigator.vibrate) {
            navigator.vibrate(100);
        }
    }

    // Ativar o Cooldown Global de 2 segundos
    isCoolingDown = true;
    
    // Feedback visual do cooldown no leitor
    const readerEl = document.getElementById('reader');
    if (readerEl) readerEl.style.opacity = '0.5';

    setTimeout(() => {
        isCoolingDown = false;
        if (readerEl) readerEl.style.opacity = '1';
    }, 2000);
}

function onScanFailure(error) {
    // Ignorar falhas normais a cada frame
}

// --- Funções da Lanterna (Nativa) ---
function getActiveVideoTrack() {
    const videoEl = document.querySelector('#reader video');
    if (videoEl && videoEl.srcObject) {
        const tracks = videoEl.srcObject.getVideoTracks();
        if (tracks && tracks.length) return tracks[0];
    }
    return null;
}

async function checkFlashlightSupport() {
    setTimeout(async () => {
        try {
            const track = getActiveVideoTrack();
            if (track) {
                const capabilities = track.getCapabilities ? track.getCapabilities() : {};
                if (capabilities.torch !== undefined) {
                    btnToggleFlash.disabled = !capabilities.torch;
                } else {
                    // Se o navegador não informa suporte explicitamente, habilita o botão para permitir a tentativa
                    btnToggleFlash.disabled = false;
                }
            } else {
                btnToggleFlash.disabled = false;
            }
        } catch (err) {
            console.warn("Não foi possível verificar suporte à lanterna", err);
            btnToggleFlash.disabled = false;
        }
    }, 600);
}

async function toggleFlashlight() {
    if (!isScanning) return;
    
    try {
        const track = getActiveVideoTrack();
        if (track) {
            isFlashlightOn = !isFlashlightOn;
            
            await track.applyConstraints({
                advanced: [{ torch: isFlashlightOn }]
            });
            
            if (isFlashlightOn) {
                btnToggleFlash.classList.remove('btn-secondary');
                btnToggleFlash.classList.add('btn-primary');
            } else {
                btnToggleFlash.classList.remove('btn-primary');
                btnToggleFlash.classList.add('btn-secondary');
            }
        } else {
            alert('Câmera não está ativa.');
        }
    } catch (err) {
        console.error("Erro ao alternar a lanterna", err);
        alert('Não foi possível acender a lanterna neste dispositivo/navegador.');
        isFlashlightOn = false;
        btnToggleFlash.classList.remove('btn-primary');
        btnToggleFlash.classList.add('btn-secondary');
    }
}

// --- Gerenciamento da Lista e Formulário ---

function loadItems() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        try {
            scannedItems = JSON.parse(saved);
        } catch (e) {
            console.error('Erro ao ler dados salvos', e);
            scannedItems = [];
        }
    }
}

function saveItems() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scannedItems));
}

function resetForm() {
    dismissDuplicateAlerts();
    
    inputPatrimonio.value = '';
    inputModelo.value = '';
    inputSerie.value = '';
    inputEan.value = '';
    inputObs.value = '';
    inputQty.value = '1';
    editingItemId = null;
    
    if (modeloBadge) modeloBadge.style.display = 'none';
    inputModelo.classList.remove('highlight-autofill');
    
    formTitle.innerText = 'Produto Atual';
    saveBtnText.innerText = 'Adicionar à Lista';
    saveIcon.className = 'fa-solid fa-plus';
}

function editItem(id) {
    const item = scannedItems.find(i => i.id === id);
    if (!item) return;
    
    editingItemId = id;
    inputPatrimonio.value = item.patrimonio || '';
    inputModelo.value = item.modelo || '';
    inputSerie.value = item.serie || '';
    inputEan.value = item.ean || '';
    inputObs.value = item.obs || '';
    inputQty.value = item.quantity || 1;
    
    formTitle.innerText = 'Editando Produto';
    saveBtnText.innerText = 'Salvar Alterações';
    saveIcon.className = 'fa-solid fa-check';
    
    // Rolar suavemente até o formulário
    document.querySelector('.current-item-form').scrollIntoView({ behavior: 'smooth' });
}

function saveCurrentItem() {
    const patrimonio = inputPatrimonio.value.trim();
    const modelo = inputModelo.value.trim();
    const serie = inputSerie.value.trim();
    const ean = inputEan.value.trim();
    const obs = inputObs.value.trim();
    const qty = parseInt(inputQty.value) || 1;
    
    if (!patrimonio && !modelo && !serie && !ean) {
        alert("Por favor, preencha pelo menos um campo de código (Patrimônio, Modelo, Série ou EAN) antes de adicionar à lista.");
        return;
    }
    
    // --- Proteção contra Duplicidade com Confirmação Segura ---
    if ((serie || patrimonio) && !editingItemId) {
        const dupWarning = checkDuplicateCode(patrimonio, serie);
        if (dupWarning) {
            playWarningSound();
            if (navigator.vibrate) navigator.vibrate([200, 100, 200]);
            
            const proceed = confirm(`⚠️ ALERTA DE DUPLICIDADE:\n\n${dupWarning}\n\nDeseja salvar mesmo assim e enviar para a planilha?`);
            if (!proceed) {
                return; // Usuário optou por não duplicar
            }
        }
    }
    // -----------------------------------------------------------
    
    // Auto-Aprender o Modelo com o EAN para as próximas leituras
    if (ean && modelo) {
        learnEanModel(ean, modelo);
    }
    
    // Registrar no Histórico Permanente da máquina
    if (patrimonio) scannedHistory.patrimonios[patrimonio.trim().toUpperCase()] = true;
    if (serie) scannedHistory.series[serie.trim().toUpperCase()] = true;
    saveHistory();
    
    if (editingItemId) {
        // Modo Edição de Item existente
        const itemIndex = scannedItems.findIndex(i => i.id === editingItemId);
        if (itemIndex >= 0) {
            scannedItems[itemIndex].patrimonio = patrimonio;
            scannedItems[itemIndex].modelo = modelo;
            scannedItems[itemIndex].serie = serie;
            scannedItems[itemIndex].ean = ean;
            scannedItems[itemIndex].obs = obs;
            scannedItems[itemIndex].quantity = qty;
        }
        feedbackText.innerText = 'Produto atualizado!';
    } else {
        // Modo Novo Item
        // Checagem inteligente: se tem número de série, NÃO acumula quantidade.
        if (serie || patrimonio) {
             const newItem = {
                id: Date.now().toString(),
                patrimonio: patrimonio,
                modelo: modelo,
                serie: serie,
                ean: ean,
                obs: obs,
                quantity: qty, // Deveria ser 1 na maioria das vezes, mas deixa o usuário forçar se quiser.
                timestamp: new Date().toLocaleString('pt-BR'),
                synced: false
            };
            scannedItems.unshift(newItem);
        } else {
            // Se NÃO tiver série ou patrimonio, tenta agrupar itens genéricos
            const existingIndex = scannedItems.findIndex(item => 
                (modelo && item.modelo === modelo) || (ean && item.ean === ean)
            );
            
            if (existingIndex >= 0 && !obs && !scannedItems[existingIndex].serie && !scannedItems[existingIndex].patrimonio) {
                // Se achou modelo idêntico e nenhum deles tem série/patrimonio
                scannedItems[existingIndex].quantity += qty;
                if (modelo && !scannedItems[existingIndex].modelo) scannedItems[existingIndex].modelo = modelo;
                if (ean && !scannedItems[existingIndex].ean) scannedItems[existingIndex].ean = ean;
                scannedItems[existingIndex].synced = false; // Como foi alterado, precisa re-sincronizar
                
                const item = scannedItems.splice(existingIndex, 1)[0];
                scannedItems.unshift(item);
            } else {
                const newItem = {
                    id: Date.now().toString(),
                    patrimonio: patrimonio,
                    modelo: modelo,
                    serie: serie,
                    ean: ean,
                    obs: obs,
                    quantity: qty,
                    timestamp: new Date().toLocaleString('pt-BR'),
                    synced: false
                };
                scannedItems.unshift(newItem);
            }
        }
        feedbackText.innerText = 'Produto adicionado!';
    }
    
    // Pegar o item recém salvo/editado para enviar
    const currentItemToSend = scannedItems[0];
    
    resetForm();
    saveItems();
    renderList();
    showFeedback();
    
    // Envio para Nuvem (Webhook)
    syncToWebhook(currentItemToSend);
}

// --- Integração Nuvem ---
async function syncToWebhook(item) {
    if (!WEBHOOK_URL) return;
    
    // UI Update visual instantâneo para "syncing"
    const syncStatusEl = document.getElementById(`sync-icon-${item.id}`);
    if (syncStatusEl) {
        syncStatusEl.className = 'fa-solid fa-cloud-arrow-up sync-status syncing';
    }
    
    try {
        const response = await fetch(WEBHOOK_URL, {
            method: 'POST',
            mode: 'no-cors', // Necessário para evitar bloqueio de CORS do Google Apps Script
            headers: {
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(item)
        });
        
        // Se a requisição não lançou erro (Network Error), assumimos que chegou com sucesso!
        console.log('Enviado para planilha com sucesso (modo no-cors).');
        
        // Marca como sincronizado
        item.synced = true;
        saveItems();
        
        // Atualiza UI
        if (syncStatusEl) {
            syncStatusEl.className = 'fa-solid fa-cloud-check sync-status synced';
            syncStatusEl.title = 'Sincronizado na nuvem';
        }
        
        // Esconde botão global se não houver mais pendentes
        updateSyncAllButton();
        
        // Feedback visual extra opcional
        feedbackText.innerText = 'Enviado p/ Planilha!';
        setTimeout(() => {
            if(!scanFeedback.classList.contains('hidden')) {
                scanFeedback.classList.add('hidden');
            }
        }, 3000);
        
    } catch (error) {
        console.error("Erro ao enviar para o Webhook (provável falha de internet):", error);
        
        if (syncStatusEl) {
            syncStatusEl.className = 'fa-solid fa-cloud-arrow-up sync-status pending';
            syncStatusEl.title = 'Aguardando sincronização (Sem internet)';
        }
        updateSyncAllButton();
        
        // Não usar alert intrusivo para falha silenciosa, apenas feedback textual
        feedbackText.innerText = 'Offline. Item salvo localmente.';
        setTimeout(() => {
            if(!scanFeedback.classList.contains('hidden')) {
                scanFeedback.classList.add('hidden');
            }
        }, 3000);
    }
}

async function syncAllPending() {
    if (!WEBHOOK_URL) return;
    
    const pendingItems = scannedItems.filter(item => !item.synced);
    if (pendingItems.length === 0) return;
    
    if (btnSyncAll) {
        btnSyncAll.disabled = true;
        btnSyncAll.innerHTML = '<i class="fa-solid fa-spinner fa-spin"></i>';
    }
    
    let successCount = 0;
    
    // Tenta enviar um por um
    for (const item of pendingItems) {
        try {
            await fetch(WEBHOOK_URL, {
                method: 'POST',
                mode: 'no-cors',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(item)
            });
            item.synced = true;
            successCount++;
        } catch (error) {
            console.error("Falha ao sincronizar item:", item.id);
            break; // Se falhou um, provavelmente continua sem internet, então aborta o loop
        }
    }
    
    if (successCount > 0) {
        saveItems();
        renderList(); // re-renderiza tudo para atualizar os ícones
        alert(`${successCount} item(s) enviado(s) para a planilha com sucesso!`);
    } else {
        alert("Sem conexão. Verifique sua internet e tente novamente.");
    }
    
    if (btnSyncAll) {
        btnSyncAll.disabled = false;
        btnSyncAll.innerHTML = '<i class="fa-solid fa-cloud-arrow-up"></i>';
    }
    updateSyncAllButton();
}

function updateSyncAllButton() {
    if (!btnSyncAll) return;
    const pendingCount = scannedItems.filter(item => !item.synced).length;
    
    if (pendingCount > 0) {
        btnSyncAll.style.display = 'inline-flex';
        btnSyncAll.title = `Sincronizar Pendentes (${pendingCount})`;
    } else {
        btnSyncAll.style.display = 'none';
    }
    
    updateGlobalSyncStatus();
}

function updateGlobalSyncStatus() {
    if (!stickyStatusBar || !statusBarIcon || !statusBarText) return;
    
    const isOnline = navigator.onLine;
    const pendingCount = scannedItems.filter(item => !item.synced).length;
    
    // Reset de classes
    stickyStatusBar.className = 'sticky-status-bar';
    
    if (!isOnline) {
        // Sem internet
        stickyStatusBar.classList.add('offline');
        statusBarIcon.className = 'fa-solid fa-cloud-arrow-down';
        statusBarText.innerText = `Modo Offline (${pendingCount} salvos no celular)`;
        stickyStatusBar.title = 'Sem conexão de internet. Os itens estão salvos no celular.';
    } else if (pendingCount > 0) {
        // Com internet, mas com itens pendentes
        stickyStatusBar.classList.add('pending');
        statusBarIcon.className = 'fa-solid fa-cloud-arrow-up';
        statusBarText.innerText = `${pendingCount} pendente(s) • Toque p/ sincronizar`;
        stickyStatusBar.title = 'Clique para enviar todos os itens pendentes para o Google Sheets!';
    } else {
        // Com internet e tudo sincronizado
        stickyStatusBar.classList.add('online');
        statusBarIcon.className = 'fa-solid fa-cloud-check';
        statusBarText.innerText = 'Conectado & Sincronizado';
        stickyStatusBar.title = 'Todos os itens estão 100% sincronizados com o Google Sheets!';
    }
}

function updateQuantity(id, delta) {
    const index = scannedItems.findIndex(item => item.id === id);
    if (index >= 0) {
        scannedItems[index].quantity += delta;
        if (scannedItems[index].quantity <= 0) {
            removeItem(id);
        } else {
            saveItems();
            renderList();
        }
    }
}

function removeItem(id) {
    if (editingItemId === id) {
        resetForm();
    }
    scannedItems = scannedItems.filter(item => item.id !== id);
    saveItems();
    renderList();
}

function clearItems() {
    if (confirm('Tem certeza que deseja apagar todos os itens escaneados?')) {
        scannedItems = [];
        resetForm();
        saveItems();
        renderList();
    }
}

// --- Renderização e Interface ---

function renderList() {
    itemsListEl.innerHTML = '';
    
    const filterTerm = searchInput.value.toLowerCase().trim();
    
    let totalItems = 0;
    let filteredItems = scannedItems;
    
    if (filterTerm) {
        filteredItems = scannedItems.filter(item => 
            (item.patrimonio && item.patrimonio.toLowerCase().includes(filterTerm)) ||
            (item.modelo && item.modelo.toLowerCase().includes(filterTerm)) ||
            (item.serie && item.serie.toLowerCase().includes(filterTerm)) ||
            (item.ean && item.ean.toLowerCase().includes(filterTerm)) ||
            (item.obs && item.obs.toLowerCase().includes(filterTerm))
        );
    }
    
    // Contagem global total
    scannedItems.forEach(item => {
        totalItems += item.quantity;
    });
    
    if (filteredItems.length === 0) {
        itemsListEl.innerHTML = filterTerm 
            ? '<li class="empty-state">Nenhum item corresponde à busca.</li>' 
            : '<li class="empty-state">Nenhum código escaneado ainda. Aponte a câmera para começar!</li>';
    } else {
        filteredItems.forEach(item => {
            const li = document.createElement('li');
            li.className = 'list-item';
            
            let codesHtml = '';
            if (item.patrimonio) {
                codesHtml += `<div class="item-code" style="color: #0369a1;"><i class="fa-solid fa-tag" style="width: 18px;"></i> ${item.patrimonio}</div>`;
            }
            if (item.modelo) {
                codesHtml += `<div class="item-code"><strong style="color: var(--text-light); font-size: 0.8rem; font-family: Inter;">Mod:</strong> ${item.modelo}</div>`;
            }
            if (item.serie) {
                codesHtml += `<div class="item-code"><strong style="color: var(--text-light); font-size: 0.8rem; font-family: Inter;">SN:</strong> ${item.serie}</div>`;
            }
            if (item.ean) {
                codesHtml += `<div class="item-code"><i class="fa-solid fa-barcode" style="width: 18px; color: var(--primary-light);"></i> ${item.ean}</div>`;
            }
            
            let obsHtml = '';
            if (item.obs) {
                obsHtml = `<div class="item-obs" style="font-size: 0.85rem; color: var(--text-light); margin-top: 0.4rem; padding-top: 0.4rem; border-top: 1px dashed var(--border-color);"><i class="fa-regular fa-comment-dots" style="width: 18px;"></i> ${item.obs}</div>`;
            }
            
            // Nuvem de Sincronização
            let syncIconClass = item.synced ? 'fa-solid fa-cloud-check sync-status synced' : 'fa-solid fa-cloud-arrow-up sync-status pending';
            let syncIconTitle = item.synced ? 'Sincronizado na nuvem' : 'Aguardando sincronização';
            
            li.innerHTML = `
                <i id="sync-icon-${item.id}" class="${syncIconClass}" title="${syncIconTitle}"></i>
                <div class="item-details" style="flex: 1; padding-right: 0.5rem; position: relative;">
                    ${codesHtml}
                    ${obsHtml}
                    <div class="item-time" style="margin-top: 0.3rem;">${item.timestamp}</div>
                </div>
                <div class="item-actions">
                    <div class="quantity-controls">
                        <button class="btn-qty" onclick="updateQuantity('${item.id}', -1)">-</button>
                        <span class="item-quantity">${item.quantity}</span>
                        <button class="btn-qty" onclick="updateQuantity('${item.id}', 1)">+</button>
                    </div>
                    <div style="display: flex; flex-direction: column; gap: 0.2rem;">
                        <button class="btn-item-action" onclick="editItem('${item.id}')" title="Editar item">
                            <i class="fa-solid fa-pen-to-square"></i>
                        </button>
                        <button class="btn-item-action danger" onclick="removeItem('${item.id}')" title="Remover item">
                            <i class="fa-solid fa-trash"></i>
                        </button>
                    </div>
                </div>
            `;
            itemsListEl.appendChild(li);
        });
    }
    
    uniqueCountEl.innerText = scannedItems.length;
    totalCountEl.innerText = totalItems;
    
    updateSyncAllButton();
}

let feedbackTimeout;
let flashTimeout;

function dismissDuplicateAlerts() {
    if (scanFeedback) {
        scanFeedback.classList.remove('warning');
        scanFeedback.classList.add('hidden');
    }
    if (btnCloseFeedback) {
        btnCloseFeedback.style.display = 'none';
    }
    if (formDuplicateAlert) {
        formDuplicateAlert.classList.add('hidden');
    }
    clearTimeout(feedbackTimeout);
}

function showFeedback() {
    dismissDuplicateAlerts();
    
    scanFeedback.classList.remove('hidden', 'warning');
    if (btnCloseFeedback) {
        btnCloseFeedback.style.display = 'none';
    }
    
    // Ativa o flash verde nas bordas da tela
    if (screenFlashOverlay) {
        screenFlashOverlay.classList.remove('warning');
        screenFlashOverlay.classList.add('active');
        clearTimeout(flashTimeout);
        flashTimeout = setTimeout(() => {
            screenFlashOverlay.classList.remove('active');
        }, 350);
    }

    clearTimeout(feedbackTimeout);
    feedbackTimeout = setTimeout(() => {
        scanFeedback.classList.add('hidden');
    }, 2500);
}

function showWarningFeedback(title, desc) {
    // 1. Banner superior de aviso com botão de fechar
    scanFeedback.classList.remove('hidden');
    scanFeedback.classList.add('warning');
    feedbackText.innerText = title;
    if (btnCloseFeedback) {
        btnCloseFeedback.style.display = 'inline-block';
    }
    
    // 2. Alerta inline dentro do formulário (sempre visível mesmo com teclado aberto)
    if (formDuplicateAlert) {
        formDuplicateAlert.classList.remove('hidden');
        if (formDuplicateTitle) formDuplicateTitle.innerText = title;
        if (formDuplicateDesc) formDuplicateDesc.innerText = desc || 'Este código já foi registrado neste inventário.';
    }
    
    // 3. Efeito visual nas bordas da tela em vermelho
    if (screenFlashOverlay) {
        screenFlashOverlay.classList.remove('active');
        screenFlashOverlay.classList.add('warning');
        clearTimeout(flashTimeout);
        flashTimeout = setTimeout(() => {
            screenFlashOverlay.classList.remove('warning');
        }, 500);
    }
    
    playWarningSound();
    if (navigator.vibrate) {
        navigator.vibrate([150, 80, 150]);
    }
    
    // Fica visível permanentemente até o usuário clicar em "Entendi / Fechar" ou escanear outro código
}

// --- Exportação e Cópia ---

function exportCSV() {
    if (scannedItems.length === 0) {
        alert('Não há dados para exportar.');
        return;
    }
    
    let csvContent = "Patrimônio;Modelo;Nº Série;EAN;Observação;Quantidade;Data/Hora\n";
    
    scannedItems.forEach(item => {
        let safePat = item.patrimonio ? item.patrimonio.replace(/"/g, '""') : '';
        let safeMod = item.modelo ? item.modelo.replace(/"/g, '""') : '';
        let safeSer = item.serie ? item.serie.replace(/"/g, '""') : '';
        let safeEan = item.ean ? item.ean.replace(/"/g, '""') : '';
        let safeObs = item.obs ? item.obs.replace(/"/g, '""') : '';
        
        csvContent += `"${safePat}";"${safeMod}";"${safeSer}";"${safeEan}";"${safeObs}";${item.quantity};"${item.timestamp}"\n`;
    });
    
    // Adiciona o BOM (Byte Order Mark) do UTF-8 para o Excel reconhecer os acentos
    const blob = new Blob(["\uFEFF" + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    
    const link = document.createElement("a");
    link.setAttribute("href", url);
    link.setAttribute("download", `inventario_${new Date().toISOString().slice(0,10)}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
}

function copyToClipboard() {
    if (scannedItems.length === 0) {
        alert('Não há dados para copiar.');
        return;
    }
    
    let textContent = "INVENTÁRIO DE PRODUTOS\n---------------------\n";
    scannedItems.forEach((item, index) => {
        textContent += `${index + 1}. Qtd: ${item.quantity}\n`;
        if (item.patrimonio) textContent += `   Patrimônio: ${item.patrimonio}\n`;
        if (item.modelo) textContent += `   Modelo: ${item.modelo}\n`;
        if (item.serie) textContent += `   Série: ${item.serie}\n`;
        if (item.ean) textContent += `   EAN: ${item.ean}\n`;
        if (item.obs) textContent += `   Obs: ${item.obs}\n`;
        textContent += `\n`;
    });
    
    navigator.clipboard.writeText(textContent).then(() => {
        feedbackText.innerText = 'Lista copiada para a área de transferência!';
        showFeedback();
    }).catch(err => {
        console.error('Erro ao copiar', err);
        alert('Não foi possível copiar automaticamente.');
    });
}
