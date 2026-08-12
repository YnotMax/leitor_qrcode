// --- Configurações Iniciais e Estado ---
const STORAGE_KEY = 'inventario_codigos';
let html5QrCode = null;
let isScanning = false;
let isFlashlightOn = false;
let isSoundEnabled = true;
let currentCameraId = null;
let scannedItems = [];
let editingItemId = null; // Guardar ID quando estiver editando um item existente

// Prevenir leituras repetidas e frenéticas do mesmo código
let lastScannedText = '';
let lastScanTime = 0;

// Contexto de Áudio Web para Beep Sonoro
let audioCtx = null;

// Elementos da UI
const btnToggleScanner = document.getElementById('btn-toggle-scanner');
const toggleScannerText = document.getElementById('toggle-scanner-text');
const btnToggleFlash = document.getElementById('btn-toggle-flash');
const btnToggleSound = document.getElementById('btn-toggle-sound');
const soundIcon = document.getElementById('sound-icon');
const scanFeedback = document.getElementById('scan-feedback');
const feedbackText = document.getElementById('feedback-text');

const itemsListEl = document.getElementById('items-list');
const totalCountEl = document.getElementById('total-count');
const uniqueCountEl = document.getElementById('unique-count');
const btnExport = document.getElementById('btn-export');
const btnCopy = document.getElementById('btn-copy');
const btnClear = document.getElementById('btn-clear');
const searchInput = document.getElementById('search-input');

// Elementos do Formulário Atual
const inputQr = document.getElementById('current-qr');
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
    loadItems();
    renderList();
    setupEventListeners();
});

function setupEventListeners() {
    btnToggleScanner.addEventListener('click', toggleScanner);
    btnToggleFlash.addEventListener('click', toggleFlashlight);
    btnToggleSound.addEventListener('click', toggleSound);
    btnExport.addEventListener('click', exportCSV);
    btnCopy.addEventListener('click', copyToClipboard);
    btnClear.addEventListener('click', clearItems);
    btnSaveItem.addEventListener('click', saveCurrentItem);
    btnResetForm.addEventListener('click', resetForm);
    searchInput.addEventListener('input', renderList);
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
            fps: 10, 
            qrbox: { width: 250, height: 250 },
            aspectRatio: 1.0,
            supportedScanTypes: [Html5QrcodeScanType.SCAN_TYPE_CAMERA]
        };

        const devices = await Html5Qrcode.getCameras();
        if (devices && devices.length) {
            currentCameraId = devices.length > 1 ? devices[devices.length - 1].id : devices[0].id;
            
            await html5QrCode.start(
                { facingMode: "environment" }, 
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

function onScanSuccess(decodedText, decodedResult) {
    const now = Date.now();
    // Debounce de 1.5s para o exato mesmo código
    if (decodedText === lastScannedText && (now - lastScanTime) < 1500) {
        return;
    }
    
    lastScannedText = decodedText;
    lastScanTime = now;
    
    const formatName = decodedResult?.result?.format?.formatName || '';
    
    if (formatName === 'QR_CODE') {
        inputQr.value = decodedText;
        feedbackText.innerText = 'QR Code capturado!';
    } else {
        inputEan.value = decodedText;
        feedbackText.innerText = 'Código de Barras capturado!';
    }
    
    playBeepSound();
    showFeedback();
    
    if (navigator.vibrate) {
        navigator.vibrate(100);
    }
}

function onScanFailure(error) {
    // Ignorar falhas normais a cada frame
}

// --- Funções da Lanterna ---
async function checkFlashlightSupport() {
    try {
        const stream = html5QrCode._localMediaStream;
        if (stream) {
            const track = stream.getVideoTracks()[0];
            const capabilities = track.getCapabilities();
            if (capabilities.torch) {
                btnToggleFlash.disabled = false;
            } else {
                btnToggleFlash.disabled = true;
            }
        }
    } catch (err) {
        console.warn("Não foi possível verificar suporte à lanterna", err);
    }
}

async function toggleFlashlight() {
    if (!isScanning) return;
    
    try {
        const stream = html5QrCode._localMediaStream;
        if (stream) {
            const track = stream.getVideoTracks()[0];
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
        }
    } catch (err) {
        console.error("Erro ao alternar a lanterna", err);
        alert('Não foi possível controlar a lanterna neste dispositivo/navegador.');
        isFlashlightOn = false;
    }
}

// --- Gerenciamento da Lista e Formulário ---

function loadItems() {
    const saved = localStorage.getItem(STORAGE_KEY);
    if (saved) {
        scannedItems = JSON.parse(saved);
    }
}

function saveItems() {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(scannedItems));
}

function resetForm() {
    inputQr.value = '';
    inputEan.value = '';
    inputObs.value = '';
    inputQty.value = '1';
    editingItemId = null;
    
    formTitle.innerText = 'Produto Atual';
    saveBtnText.innerText = 'Adicionar à Lista';
    saveIcon.className = 'fa-solid fa-plus';
}

function editItem(id) {
    const item = scannedItems.find(i => i.id === id);
    if (!item) return;
    
    editingItemId = id;
    inputQr.value = item.qr || '';
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
    const qr = inputQr.value.trim();
    const ean = inputEan.value.trim();
    const obs = inputObs.value.trim();
    const qty = parseInt(inputQty.value) || 1;
    
    if (!qr && !ean) {
        alert("Por favor, preencha o QR Code ou o Código de Barras antes de adicionar à lista.");
        return;
    }
    
    if (editingItemId) {
        // Modo Edição de Item existente
        const itemIndex = scannedItems.findIndex(i => i.id === editingItemId);
        if (itemIndex >= 0) {
            scannedItems[itemIndex].qr = qr;
            scannedItems[itemIndex].ean = ean;
            scannedItems[itemIndex].obs = obs;
            scannedItems[itemIndex].quantity = qty;
        }
        feedbackText.innerText = 'Produto atualizado!';
    } else {
        // Modo Novo Item
        const existingIndex = scannedItems.findIndex(item => 
            (qr && item.qr === qr) || (ean && item.ean === ean)
        );
        
        if (existingIndex >= 0 && !obs) {
            scannedItems[existingIndex].quantity += qty;
            if (qr && !scannedItems[existingIndex].qr) scannedItems[existingIndex].qr = qr;
            if (ean && !scannedItems[existingIndex].ean) scannedItems[existingIndex].ean = ean;
            
            const item = scannedItems.splice(existingIndex, 1)[0];
            scannedItems.unshift(item);
        } else {
            const newItem = {
                id: Date.now().toString(),
                qr: qr,
                ean: ean,
                obs: obs,
                quantity: qty,
                timestamp: new Date().toLocaleString('pt-BR')
            };
            scannedItems.unshift(newItem);
        }
        feedbackText.innerText = 'Produto adicionado!';
    }
    
    resetForm();
    saveItems();
    renderList();
    showFeedback();
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
            (item.qr && item.qr.toLowerCase().includes(filterTerm)) ||
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
            if (item.qr) {
                codesHtml += `<div class="item-code"><i class="fa-solid fa-qrcode" style="width: 18px; color: var(--primary-light);"></i> ${item.qr}</div>`;
            }
            if (item.ean) {
                codesHtml += `<div class="item-code"><i class="fa-solid fa-barcode" style="width: 18px; color: var(--primary-light);"></i> ${item.ean}</div>`;
            }
            
            let obsHtml = '';
            if (item.obs) {
                obsHtml = `<div class="item-obs" style="font-size: 0.85rem; color: var(--text-light); margin-top: 0.2rem;"><i class="fa-regular fa-comment-dots" style="width: 18px;"></i> ${item.obs}</div>`;
            }
            
            li.innerHTML = `
                <div class="item-details" style="flex: 1; padding-right: 0.5rem;">
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
                    <button class="btn-item-action" onclick="editItem('${item.id}')" title="Editar item">
                        <i class="fa-solid fa-pen-to-square"></i>
                    </button>
                    <button class="btn-item-action danger" onclick="removeItem('${item.id}')" title="Remover item">
                        <i class="fa-solid fa-trash"></i>
                    </button>
                </div>
            `;
            itemsListEl.appendChild(li);
        });
    }
    
    uniqueCountEl.innerText = scannedItems.length;
    totalCountEl.innerText = totalItems;
}

let feedbackTimeout;
function showFeedback() {
    scanFeedback.classList.remove('hidden');
    clearTimeout(feedbackTimeout);
    feedbackTimeout = setTimeout(() => {
        scanFeedback.classList.add('hidden');
    }, 2000);
}

// --- Exportação e Cópia ---

function exportCSV() {
    if (scannedItems.length === 0) {
        alert('Não há dados para exportar.');
        return;
    }
    
    let csvContent = "QR Code,EAN/Código de Barras,Observação,Quantidade,Data/Hora\n";
    
    scannedItems.forEach(item => {
        let safeQr = item.qr ? item.qr.replace(/"/g, '""') : '';
        let safeEan = item.ean ? item.ean.replace(/"/g, '""') : '';
        let safeObs = item.obs ? item.obs.replace(/"/g, '""') : '';
        
        csvContent += `"${safeQr}","${safeEan}","${safeObs}",${item.quantity},"${item.timestamp}"\n`;
    });
    
    const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8;' });
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
        if (item.qr) textContent += `   QR: ${item.qr}\n`;
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
