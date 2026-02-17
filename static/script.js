// DOM Elements
const form = document.getElementById('converter-form');
const dropZone = document.getElementById('drop-zone');
const fileInput = document.getElementById('file-input');
const fileList = document.getElementById('file-list');
const sourceFormat = document.getElementById('source-format');
const targetFormat = document.getElementById('target-format');
const qualitySlider = document.getElementById('quality');
const qualityValue = document.getElementById('quality-value');
const widthInput = document.getElementById('width');
const heightInput = document.getElementById('height');
const resizePercentInput = document.getElementById('resize-percent');
const maintainAspectRatio = document.getElementById('maintain-aspect-ratio');
const convertBtn = document.getElementById('convert-btn');
const btnText = convertBtn.querySelector('.btn-text');
const btnLoading = convertBtn.querySelector('.btn-loading');
const progressSection = document.getElementById('progress-section');
const progressCount = document.getElementById('progress-count');
const progressBar = document.getElementById('progress-bar');
const progressStatus = document.getElementById('progress-status');
const resultsSection = document.getElementById('results-section');
const convertedFilesList = document.getElementById('converted-files-list');
const downloadAllBtn = document.getElementById('download-all-btn');
const errorSection = document.getElementById('error-section');
const errorMessage = document.getElementById('error-message');

// Resize mode elements
const resizeTabs = document.querySelectorAll('.resize-tab');
const resizePercentageSection = document.getElementById('resize-percentage');
const resizeDimensionsSection = document.getElementById('resize-dimensions');

// State
let selectedFiles = [];
let originalAspectRatios = new Map();
let convertedBlobs = [];
let currentResizeMode = 'none';

// Format file extensions mapping
const formatExtensions = {
    'all': ['*'],
    'png': ['.png'],
    'jpg': ['.jpg', '.jpeg'],
    'gif': ['.gif'],
    'webp': ['.webp'],
    'heic': ['.heic', '.heif']
};

// Initialize
function init() {
    setupEventListeners();
    updateConvertButton();
}

function setupEventListeners() {
    // Drop zone events
    dropZone.addEventListener('click', () => fileInput.click());
    dropZone.addEventListener('dragover', handleDragOver);
    dropZone.addEventListener('dragleave', handleDragLeave);
    dropZone.addEventListener('drop', handleDrop);
    fileInput.addEventListener('change', handleFileSelect);

    // Quality slider
    qualitySlider.addEventListener('input', () => {
        qualityValue.textContent = qualitySlider.value;
    });

    // Source format filter
    sourceFormat.addEventListener('change', () => {
        updateFileInputAccept();
    });

    // Resize mode tabs
    resizeTabs.forEach(tab => {
        tab.addEventListener('click', () => {
            setResizeMode(tab.dataset.mode);
        });
    });

    // Download all button
    downloadAllBtn.addEventListener('click', handleDownloadAll);

    // Form submission
    form.addEventListener('submit', handleSubmit);
}

function setResizeMode(mode) {
    currentResizeMode = mode;

    // Update tab states
    resizeTabs.forEach(tab => {
        tab.classList.toggle('active', tab.dataset.mode === mode);
    });

    // Show/hide resize options
    resizePercentageSection.hidden = mode !== 'percentage';
    resizeDimensionsSection.hidden = mode !== 'dimensions';

    // Clear values when switching modes
    if (mode !== 'percentage') {
        resizePercentInput.value = '100';
    }
    if (mode !== 'dimensions') {
        widthInput.value = '';
        heightInput.value = '';
    }
}

function handleDragOver(e) {
    e.preventDefault();
    dropZone.classList.add('drag-over');
}

function handleDragLeave(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');
}

function handleDrop(e) {
    e.preventDefault();
    dropZone.classList.remove('drag-over');

    const files = Array.from(e.dataTransfer.files);
    addFiles(files);
}

function handleFileSelect(e) {
    const files = Array.from(e.target.files);
    addFiles(files);
    fileInput.value = '';
}

function updateFileInputAccept() {
    const format = sourceFormat.value;
    if (format === 'all') {
        fileInput.accept = 'image/*,.heic,.heif';
    } else {
        const extensions = formatExtensions[format];
        fileInput.accept = extensions.join(',');
    }
}

function addFiles(files) {
    const format = sourceFormat.value;

    const filteredFiles = files.filter(file => {
        if (format === 'all') return isImageFile(file);
        const ext = '.' + file.name.split('.').pop().toLowerCase();
        return formatExtensions[format].includes(ext);
    });

    if (filteredFiles.length === 0) {
        showError('No valid image files found. Please check the source format filter.');
        return;
    }

    filteredFiles.forEach(file => {
        const exists = selectedFiles.some(f => f.name === file.name && f.size === file.size);
        if (!exists) {
            selectedFiles.push(file);
        }
    });

    renderFileList();
    updateConvertButton();
    hideError();
    hideResults();
}

function isImageFile(file) {
    const imageTypes = ['image/png', 'image/jpeg', 'image/gif', 'image/webp', 'image/heic', 'image/heif'];
    const imageExtensions = ['.png', '.jpg', '.jpeg', '.gif', '.webp', '.heic', '.heif'];

    if (imageTypes.includes(file.type)) return true;

    const ext = '.' + file.name.split('.').pop().toLowerCase();
    return imageExtensions.includes(ext);
}

function renderFileList() {
    fileList.innerHTML = '';

    selectedFiles.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'file-item';

        const preview = document.createElement('img');
        preview.className = 'file-preview';
        preview.alt = file.name;

        if (file.type === 'image/heic' || file.name.toLowerCase().endsWith('.heic') || file.name.toLowerCase().endsWith('.heif')) {
            preview.src = 'data:image/svg+xml,' + encodeURIComponent('<svg xmlns="http://www.w3.org/2000/svg" width="40" height="40" viewBox="0 0 24 24" fill="none" stroke="#64748b" stroke-width="2"><rect x="3" y="3" width="18" height="18" rx="2"/><circle cx="8.5" cy="8.5" r="1.5"/><path d="m21 15-5-5L5 21"/></svg>');
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                preview.src = e.target.result;
                const img = new Image();
                img.onload = () => {
                    originalAspectRatios.set(file.name, img.width / img.height);
                };
                img.src = e.target.result;
            };
            reader.readAsDataURL(file);
        }

        const fileInfo = document.createElement('div');
        fileInfo.className = 'file-info';
        fileInfo.innerHTML = `
            <div class="file-details">
                <div class="file-name">${file.name}</div>
                <div class="file-size">${formatFileSize(file.size)}</div>
            </div>
        `;
        fileInfo.prepend(preview);

        const removeBtn = document.createElement('button');
        removeBtn.type = 'button';
        removeBtn.className = 'file-remove';
        removeBtn.innerHTML = '&times;';
        removeBtn.onclick = () => removeFile(index);

        fileItem.appendChild(fileInfo);
        fileItem.appendChild(removeBtn);
        fileList.appendChild(fileItem);
    });
}

function removeFile(index) {
    const file = selectedFiles[index];
    originalAspectRatios.delete(file.name);
    selectedFiles.splice(index, 1);
    renderFileList();
    updateConvertButton();
}

function formatFileSize(bytes) {
    if (bytes === 0) return '0 Bytes';
    const k = 1024;
    const sizes = ['Bytes', 'KB', 'MB', 'GB'];
    const i = Math.floor(Math.log(bytes) / Math.log(k));
    return parseFloat((bytes / Math.pow(k, i)).toFixed(2)) + ' ' + sizes[i];
}

function updateConvertButton() {
    convertBtn.disabled = selectedFiles.length === 0;
    if (selectedFiles.length === 0) {
        btnText.textContent = 'Convert Images';
    } else if (selectedFiles.length === 1) {
        btnText.textContent = 'Convert Image';
    } else {
        btnText.textContent = `Convert ${selectedFiles.length} Images`;
    }
}

async function handleSubmit(e) {
    e.preventDefault();

    if (selectedFiles.length === 0) return;

    const totalFiles = selectedFiles.length;
    convertedBlobs = [];
    let completedCount = 0;

    setLoading(true);
    hideError();
    hideResults();
    showProgress(0, totalFiles, 'Starting conversion...');

    try {
        for (let i = 0; i < selectedFiles.length; i++) {
            const file = selectedFiles[i];
            updateProgress(completedCount, totalFiles, `Converting: ${file.name}`);

            const formData = new FormData();
            formData.append('files', file);
            formData.append('target_format', targetFormat.value);
            formData.append('quality', qualitySlider.value);

            // Add resize parameters based on mode
            if (currentResizeMode === 'percentage' && resizePercentInput.value) {
                formData.append('resize_percent', resizePercentInput.value);
            } else if (currentResizeMode === 'dimensions') {
                if (widthInput.value) {
                    formData.append('width', widthInput.value);
                }
                if (heightInput.value) {
                    formData.append('height', heightInput.value);
                }
                formData.append('maintain_aspect_ratio', maintainAspectRatio.checked);
            }

            const response = await fetch('/convert', {
                method: 'POST',
                body: formData
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(`Error converting ${file.name}: ${error.detail || 'Conversion failed'}`);
            }

            const contentDisposition = response.headers.get('Content-Disposition');
            let filename = file.name.replace(/\.[^.]+$/, '.' + targetFormat.value.toLowerCase());
            if (contentDisposition) {
                const match = contentDisposition.match(/filename="?([^"]+)"?/);
                if (match) {
                    filename = match[1];
                }
            }

            const blob = await response.blob();
            convertedBlobs.push({ filename, blob, originalName: file.name });

            completedCount++;
            updateProgress(completedCount, totalFiles, `Completed: ${file.name}`);
        }

        updateProgress(totalFiles, totalFiles, 'All images converted!');
        hideProgress();
        showResults();

        // Clear selected files
        selectedFiles = [];
        originalAspectRatios.clear();
        renderFileList();
        updateConvertButton();

    } catch (error) {
        hideProgress();
        showError(error.message);
    } finally {
        setLoading(false);
    }
}

async function handleDownloadAll() {
    if (convertedBlobs.length === 0) return;

    if (convertedBlobs.length === 1) {
        downloadBlob(convertedBlobs[0].blob, convertedBlobs[0].filename);
    } else {
        const zipBlob = await createZipFile(convertedBlobs);
        downloadBlob(zipBlob, 'converted_images.zip');
    }
}

function downloadSingleFile(index) {
    if (index >= 0 && index < convertedBlobs.length) {
        const { filename, blob } = convertedBlobs[index];
        downloadBlob(blob, filename);
    }
}

async function createZipFile(files) {
    if (typeof JSZip === 'undefined') {
        await loadScript('https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js');
    }

    const zip = new JSZip();
    files.forEach(({ filename, blob }) => {
        zip.file(filename, blob);
    });

    return await zip.generateAsync({ type: 'blob' });
}

function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

function downloadBlob(blob, filename) {
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
}

function setLoading(loading) {
    convertBtn.disabled = loading;
    btnText.hidden = loading;
    btnLoading.hidden = !loading;
}

function showProgress(completed, total, status) {
    progressSection.hidden = false;
    updateProgress(completed, total, status);
}

function updateProgress(completed, total, status) {
    progressCount.textContent = `${completed} / ${total}`;
    const percentage = total > 0 ? (completed / total) * 100 : 0;
    progressBar.style.width = `${percentage}%`;
    progressStatus.textContent = status;
}

function hideProgress() {
    progressSection.hidden = true;
    progressBar.style.width = '0%';
}

function showResults() {
    resultsSection.hidden = false;
    renderConvertedFiles();
}

function renderConvertedFiles() {
    convertedFilesList.innerHTML = '';

    convertedBlobs.forEach((file, index) => {
        const fileItem = document.createElement('div');
        fileItem.className = 'converted-file-item';

        // Create preview
        const preview = document.createElement('img');
        preview.className = 'converted-file-preview';
        preview.alt = file.filename;

        // Create object URL for preview
        const previewUrl = URL.createObjectURL(file.blob);
        preview.src = previewUrl;

        const fileInfo = document.createElement('div');
        fileInfo.className = 'converted-file-info';

        const fileDetails = document.createElement('div');
        fileDetails.className = 'converted-file-details';
        fileDetails.innerHTML = `
            <div class="converted-file-name">${file.filename}</div>
            <div class="converted-file-size">${formatFileSize(file.blob.size)}</div>
        `;

        fileInfo.appendChild(preview);
        fileInfo.appendChild(fileDetails);

        // Download button
        const downloadBtn = document.createElement('button');
        downloadBtn.type = 'button';
        downloadBtn.className = 'download-btn';
        downloadBtn.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2">
                <path d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4"/>
                <polyline points="7 10 12 15 17 10"/>
                <line x1="12" y1="15" x2="12" y2="3"/>
            </svg>
            Download
        `;
        downloadBtn.onclick = () => downloadSingleFile(index);

        fileItem.appendChild(fileInfo);
        fileItem.appendChild(downloadBtn);
        convertedFilesList.appendChild(fileItem);
    });
}

function hideResults() {
    resultsSection.hidden = true;
    convertedFilesList.innerHTML = '';
    convertedBlobs = [];
}

function showError(message) {
    errorSection.hidden = false;
    errorMessage.textContent = message;
}

function hideError() {
    errorSection.hidden = true;
}

// Initialize on load
init();
