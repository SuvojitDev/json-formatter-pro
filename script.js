let currentJSON = null;
let jsonWorker = null;
let operationCount = 0;
let lastOperationTime = Date.now();
let inputDebounceTimer = null;
const MAX_FILE_SIZE = 10 * 1024 * 1024; // 10MB
const MAX_OPERATIONS_PER_MINUTE = 30;
const OPERATION_RESET_TIME = 60000; // 1 minute
const MAX_TREE_NODES = 1000;
const MAX_RECURSION_DEPTH = 50;
const DEBOUNCE_DELAY = 300;

if (window.Worker) {
    try {
        jsonWorker = new Worker('json-worker.js');
        jsonWorker.onerror = function(error) {
            jsonWorker = null;
        };
    } catch (e) {
        jsonWorker = null;
    }
}

const jsonInput = document.getElementById('jsonInput');
const treeView = document.getElementById('treeView');
const status = document.getElementById('status');
const themeToggle = document.getElementById('themeToggle');
const fileInput = document.getElementById('fileInput');
const exportModal = document.getElementById('exportModal');
const schemaInput = document.getElementById('schemaInput');
const jsonPathInput = document.getElementById('jsonPathInput');
const queryResult = document.getElementById('queryResult');
const cursorPos = document.getElementById('cursorPos');
const lineNumbers = document.getElementById('lineNumbers');
const charCount = document.getElementById('charCount');
const treeCharCount = document.getElementById('treeCharCount');
const lineHighlight = document.createElement('div');
lineHighlight.className = 'line-highlight';
lineHighlight.style.display = 'none';

if (jsonInput) {
    jsonInput.parentElement.insertBefore(lineHighlight, jsonInput);
    
    jsonInput.addEventListener('input', () => {
        clearTimeout(inputDebounceTimer);
        inputDebounceTimer = setTimeout(() => {
            validateAndRender();
            updateLineNumbers();
            updateCharCount();
        }, DEBOUNCE_DELAY);
    });
    jsonInput.addEventListener('keyup', () => {
        updateCursorPosition();
        updateCharCount();
        highlightCurrentLine();
    });
    jsonInput.addEventListener('click', () => {
        updateCursorPosition();
        updateCharCount();
        highlightCurrentLine();
    });
    jsonInput.addEventListener('focus', () => {
        lineHighlight.style.display = 'block';
        highlightCurrentLine();
    });
    jsonInput.addEventListener('blur', () => {
        lineHighlight.style.display = 'none';
    });
    jsonInput.addEventListener('mouseup', updateCharCount);
    jsonInput.addEventListener('scroll', syncScroll);
}

if (themeToggle) themeToggle.addEventListener('click', toggleTheme);
if (fileInput) fileInput.addEventListener('change', handleFileUpload);

function showStatus(message, type) {
    const statusDiv = document.createElement('div');
    statusDiv.style.cssText = `
        position: fixed;
        top: 20px;
        right: 20px;
        padding: 1rem 1.5rem;
        border-radius: 0.5rem;
        font-size: 0.875rem;
        z-index: 9999;
        box-shadow: 0 10px 25px rgba(0,0,0,0.2);
        animation: slideIn 0.3s ease;
        ${type === 'error' 
            ? 'background: #fee2e2; color: #991b1b; border: 1px solid #fca5a5;' 
            : 'background: #d1fae5; color: #065f46; border: 1px solid #6ee7b7;'}
    `;
    statusDiv.innerHTML = `<i class="fas fa-${type === 'error' ? 'exclamation-circle' : 'check-circle'}"></i> ${message}`;
    
    document.body.appendChild(statusDiv);
    
    setTimeout(() => {
        statusDiv.style.animation = 'slideOut 0.3s ease';
        setTimeout(() => statusDiv.remove(), 300);
    }, 3000);
}

function checkRateLimit() {
    const now = Date.now();
    if (now - lastOperationTime > OPERATION_RESET_TIME) {
        operationCount = 0;
        lastOperationTime = now;
    }
    
    operationCount++;
    if (operationCount > MAX_OPERATIONS_PER_MINUTE) {
        showStatus('Too many operations. Please wait a minute.', 'error');
        return false;
    }
    return true;
}

function validateAndRender() {
    if (!checkRateLimit()) return;
    if (!jsonInput || !treeView) return;
    
    const input = jsonInput.value.trim();
    
    // Input size validation
    if (input.length > MAX_FILE_SIZE) {
        showStatus('File too large. Maximum 10MB allowed.', 'error');
        return;
    }
    
    // XSS prevention - check for script tags
    if (/<script|javascript:|onerror=/i.test(input)) {
        showStatus('Invalid content detected.', 'error');
        return;
    }
    if (!input) {
        treeView.innerHTML = '<div style="color: #9ca3af; text-align: center; padding: 2.5rem 0;"><i class="fas fa-code" style="font-size: 2.25rem; margin-bottom: 0.5rem;"></i><br>Enter JSON to see tree view</div>';
        currentJSON = null;
        return;
    }

    const fileSize = new Blob([input]).size;
    
    if (fileSize > 1024 * 1024 && jsonWorker) {
        treeView.innerHTML = '<div style="color: #2563eb; text-align: center; padding: 2.5rem 0;"><i class="fas fa-spinner fa-spin" style="font-size: 2rem;"></i><br>Processing large file...</div>';
        
        jsonWorker.postMessage({ action: 'parse', data: input });
        jsonWorker.onmessage = function(e) {
            if (e.data.success) {
                currentJSON = e.data.data;
                renderTree(currentJSON);
                updateTreeCharCount();
                showStatus('Valid JSON', 'success');
            } else {
                treeView.innerHTML = `<div style="color: #dc2626; padding: 1.25rem;"><i class="fas fa-times-circle"></i> Invalid JSON: ${e.data.error}</div>`;
                currentJSON = null;
                showStatus(`Invalid JSON: ${e.data.error}`, 'error');
            }
        };
    } else {
        try {
            currentJSON = JSON.parse(input);
            renderTree(currentJSON);
            updateTreeCharCount();
            showStatus('Valid JSON', 'success');
        } catch (error) {
            treeView.innerHTML = `<div style="color: #dc2626; padding: 1.25rem;"><i class="fas fa-times-circle"></i> Invalid JSON: ${error.message}</div>`;
            currentJSON = null;
            showStatus('Invalid JSON', 'error');
        }
    }
}

function formatJSON() {
    if (!checkRateLimit()) return;
    if (currentJSON !== null && jsonInput) {
        jsonInput.value = JSON.stringify(currentJSON, null, 2);
        showStatus('JSON formatted', 'success');
    }
}

function minifyJSON() {
    if (!checkRateLimit()) return;
    if (currentJSON !== null && jsonInput) {
        jsonInput.value = JSON.stringify(currentJSON);
        showStatus('JSON minified', 'success');
    }
}

function clearInput() {
    if (!jsonInput || !treeView || !status) return;
    
    jsonInput.value = '';
    treeView.innerHTML = '<div style="color: #9ca3af; text-align: center; padding: 2.5rem 0;"><i class="fas fa-code" style="font-size: 2.25rem; margin-bottom: 0.5rem;"></i><br>Enter JSON to see tree view</div>';
    currentJSON = null;
    status.innerHTML = '';
    updateLineNumbers();
    updateCharCount();
    updateCursorPosition();
    if (treeCharCount) treeCharCount.textContent = '0 chars';
    
    // Clean up memory
    if (window.gc) window.gc();
}

function copyJSON() {
    if (!checkRateLimit()) return;
    if (currentJSON !== null) {
        const jsonString = JSON.stringify(currentJSON, null, 2);
        if (jsonString.length > MAX_FILE_SIZE) {
            showStatus('JSON too large to copy. Maximum 10MB.', 'error');
            return;
        }
        navigator.clipboard.writeText(jsonString)
            .then(() => showStatus('JSON copied to clipboard', 'success'))
            .catch(() => showStatus('Failed to copy to clipboard', 'error'));
    }
}

function downloadJSON() {
    if (!checkRateLimit()) return;
    if (currentJSON !== null) {
        try {
            const jsonString = JSON.stringify(currentJSON, null, 2);
            if (jsonString.length > MAX_FILE_SIZE) {
                showStatus('JSON too large to download. Maximum 10MB.', 'error');
                return;
            }
            const blob = new Blob([jsonString], { type: 'application/json' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = 'formatted_' + Date.now() + '.json';
            a.click();
            URL.revokeObjectURL(url);
            showStatus('JSON downloaded', 'success');
        } catch (error) {
            showStatus('Failed to download JSON', 'error');
        }
    }
}

function renderTree(obj, container = treeView, level = 0) {
    if (!container) return;
    container.innerHTML = '';
    
    const nodeCount = countNodes(obj);
    if (nodeCount > MAX_TREE_NODES) {
        container.innerHTML = '<div style="color: #f59e0b; padding: 1rem;"><i class="fas fa-exclamation-triangle"></i> Large JSON detected (' + nodeCount + ' nodes). Tree view limited to prevent browser freeze. Use Download or Copy instead.</div>';
        return;
    }
    
    renderNode(obj, container, '', level);
}

function countNodes(obj, count = 0, depth = 0) {
    if (depth > MAX_RECURSION_DEPTH) return count;
    if (typeof obj === 'object' && obj !== null) {
        count++;
        if (count > MAX_TREE_NODES) return count;
        if (Array.isArray(obj)) {
            obj.forEach(item => count = countNodes(item, count, depth + 1));
        } else {
            Object.values(obj).forEach(val => count = countNodes(val, count, depth + 1));
        }
    }
    return count;
}

function renderNode(value, container, key = '', level = 0) {
    if (!container) return;
    
    const div = document.createElement('div');
    div.style.marginLeft = `${level * 20}px`;

    if (value === null) {
        if (key) {
            const keySpan = document.createElement('span');
            keySpan.className = 'text-blue-600';
            keySpan.style.fontWeight = 'bold';
            keySpan.textContent = `"${key}": `;
            div.appendChild(keySpan);
        }
        const nullSpan = document.createElement('span');
        nullSpan.className = 'text-gray-500';
        nullSpan.textContent = 'null';
        div.appendChild(nullSpan);
    } else if (typeof value === 'string') {
        if (key) {
            const keySpan = document.createElement('span');
            keySpan.className = 'text-blue-600';
            keySpan.style.fontWeight = 'bold';
            keySpan.textContent = `"${key}": `;
            div.appendChild(keySpan);
        }
        const stringSpan = document.createElement('span');
        stringSpan.className = 'text-green-600';
        stringSpan.textContent = `"${value}"`;
        div.appendChild(stringSpan);
    } else if (typeof value === 'number') {
        if (key) {
            const keySpan = document.createElement('span');
            keySpan.className = 'text-blue-600';
            keySpan.style.fontWeight = 'bold';
            keySpan.textContent = `"${key}": `;
            div.appendChild(keySpan);
        }
        const numberSpan = document.createElement('span');
        numberSpan.className = 'text-orange-600';
        numberSpan.textContent = value.toString();
        div.appendChild(numberSpan);
    } else if (typeof value === 'boolean') {
        if (key) {
            const keySpan = document.createElement('span');
            keySpan.className = 'text-blue-600';
            keySpan.style.fontWeight = 'bold';
            keySpan.textContent = `"${key}": `;
            div.appendChild(keySpan);
        }
        const boolSpan = document.createElement('span');
        boolSpan.className = 'text-pink-600';
        boolSpan.textContent = value.toString();
        div.appendChild(boolSpan);
    } else if (Array.isArray(value)) {
        const toggle = document.createElement('span');
        toggle.className = 'cursor-pointer select-none text-gray-900';
        
        const arrow = document.createElement('i');
        arrow.className = 'fas fa-chevron-down arrow';
        toggle.appendChild(arrow);
        
        if (key) {
            const keySpan = document.createElement('span');
            keySpan.className = 'text-blue-600';
            keySpan.style.fontWeight = 'bold';
            keySpan.textContent = `"${key}": `;
            toggle.appendChild(keySpan);
        }
        
        const arrayLabel = document.createElement('span');
        arrayLabel.textContent = `[${value.length}]`;
        toggle.appendChild(arrayLabel);

        const children = document.createElement('div');
        children.className = 'ml-4';

        value.forEach((item, index) => {
            renderNode(item, children, `[${index}]`, level + 1);
        });

        toggle.onclick = () => {
            if (children.style.display === 'none') {
                children.style.display = 'block';
                arrow.className = 'fas fa-chevron-down arrow';
            } else {
                children.style.display = 'none';
                arrow.className = 'fas fa-chevron-right arrow';
            }
        };

        div.appendChild(toggle);
        div.appendChild(children);
    } else if (typeof value === 'object') {
        const keys = Object.keys(value);
        const toggle = document.createElement('span');
        toggle.className = 'cursor-pointer select-none text-gray-900';
        
        const arrow = document.createElement('i');
        arrow.className = 'fas fa-chevron-down arrow';
        toggle.appendChild(arrow);
        
        if (key) {
            const keySpan = document.createElement('span');
            keySpan.className = 'text-blue-600';
            keySpan.style.fontWeight = 'bold';
            keySpan.textContent = `"${key}": `;
            toggle.appendChild(keySpan);
        }
        
        const objectLabel = document.createElement('span');
        objectLabel.textContent = `{${keys.length}}`;
        toggle.appendChild(objectLabel);

        const children = document.createElement('div');
        children.className = 'ml-4';

        keys.forEach(k => {
            renderNode(value[k], children, k, level + 1);
        });

        toggle.onclick = () => {
            if (children.style.display === 'none') {
                children.style.display = 'block';
                arrow.className = 'fas fa-chevron-down arrow';
            } else {
                children.style.display = 'none';
                arrow.className = 'fas fa-chevron-right arrow';
            }
        };

        div.appendChild(toggle);
        div.appendChild(children);
    }

    container.appendChild(div);
}

function expandAll() {
    document.querySelectorAll('#treeView i.fa-chevron-right').forEach(icon => {
        icon.className = 'fas fa-chevron-down arrow';
        const parent = icon.parentElement.parentElement;
        const children = parent.querySelector('div');
        if (children) children.style.display = 'block';
    });
}

function collapseAll() {
    document.querySelectorAll('#treeView i.fa-chevron-down').forEach(icon => {
        icon.className = 'fas fa-chevron-right arrow';
        const parent = icon.parentElement.parentElement;
        const children = parent.querySelector('div');
        if (children) children.style.display = 'none';
    });
}

function toggleTheme() {
    const body = document.body;
    const button = themeToggle;
    
    if (!button) return;

    try {
        if (body.classList.contains('dark')) {
            body.classList.remove('dark');
            button.innerHTML = '<i class="fas fa-moon"></i> Dark';
            localStorage.setItem('theme', 'light');
        } else {
            body.classList.add('dark');
            button.innerHTML = '<i class="fas fa-sun"></i> Light';
            localStorage.setItem('theme', 'dark');
        }
    } catch (e) {
        // Silent fail
    }
}

function loadTheme() {
    try {
        const savedTheme = localStorage.getItem('theme');
        if (savedTheme === 'dark') {
            document.body.classList.add('dark');
            if (themeToggle) themeToggle.innerHTML = '<i class="fas fa-sun"></i> Light';
        }
    } catch (e) {
        // Silent fail
    }
}

loadTheme();

function updateLineNumbers() {
    if (!jsonInput || !lineNumbers) return;
    const lines = jsonInput.value.split('\n').length;
    lineNumbers.innerHTML = Array.from({length: lines}, (_, i) => i + 1).join('\n');
}

function updateCursorPosition() {
    if (!jsonInput || !cursorPos) return;
    const pos = jsonInput.selectionStart;
    const text = jsonInput.value.substring(0, pos);
    const line = text.split('\n').length;
    const col = pos - text.lastIndexOf('\n');
    cursorPos.textContent = `Ln ${line}, Col ${col}`;
}

function highlightCurrentLine() {
    if (!jsonInput || !lineHighlight) return;
    const pos = jsonInput.selectionStart;
    const text = jsonInput.value.substring(0, pos);
    const line = text.split('\n').length;
    const style = getComputedStyle(jsonInput);
    const lineHeight = parseFloat(style.lineHeight);
    const fontSize = parseFloat(style.fontSize);
    const actualLineHeight = isNaN(lineHeight) ? fontSize * 1.5 : lineHeight;
    const paddingTop = parseFloat(style.paddingTop);
    
    lineHighlight.style.height = `${actualLineHeight}px`;
    lineHighlight.style.top = `${paddingTop + (line - 1) * actualLineHeight}px`;
}

function syncScroll() {
    if (!jsonInput || !lineNumbers) return;
    lineNumbers.scrollTop = jsonInput.scrollTop;
}

function updateCharCount() {
    if (!jsonInput || !charCount) return;
    const total = jsonInput.value.length;
    const selected = jsonInput.selectionEnd - jsonInput.selectionStart;
    if (selected > 0) {
        charCount.textContent = `${total.toLocaleString()} chars | ${selected.toLocaleString()} selected`;
    } else {
        charCount.textContent = `${total.toLocaleString()} chars`;
    }
}

function updateTreeCharCount() {
    if (!treeCharCount) return;
    if (!currentJSON) {
        treeCharCount.textContent = '0 chars';
        return;
    }
    const count = JSON.stringify(currentJSON).length;
    treeCharCount.textContent = `${count.toLocaleString()} chars`;
}

function handleFileUpload(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    
    // File size check
    if (file.size > MAX_FILE_SIZE) {
        showStatus('File too large. Maximum 10MB allowed.', 'error');
        fileInput.value = '';
        return;
    }
    
    // File type check
    if (!file.type.includes('json') && !file.name.endsWith('.json')) {
        showStatus('Only JSON files allowed.', 'error');
        fileInput.value = '';
        return;
    }
    
    const reader = new FileReader();
    reader.onload = (event) => {
        if (jsonInput && event.target?.result) {
            jsonInput.value = event.target.result;
            validateAndRender();
            showStatus(`File "${file.name}" loaded successfully`, 'success');
        }
    };
    reader.readAsText(file);
}

function exportAs(format) {
    if (!checkRateLimit()) return;
    if (!currentJSON) return;
    
    const jsonSize = JSON.stringify(currentJSON).length;
    if (jsonSize > MAX_FILE_SIZE) {
        showStatus('JSON too large to export. Maximum 10MB.', 'error');
        return;
    }
    
    let content = '';
    let filename = '';
    let mimeType = '';
    
    try {
        if (format === 'csv') {
            content = jsonToCSV(currentJSON);
            filename = 'export.csv';
            mimeType = 'text/csv';
        } else if (format === 'xml') {
            content = jsonToXML(currentJSON);
            filename = 'export.xml';
            mimeType = 'application/xml';
        } else if (format === 'yaml') {
            content = jsonToYAML(currentJSON);
            filename = 'export.yaml';
            mimeType = 'text/yaml';
        }
        
        const blob = new Blob([content], { type: mimeType });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = 'export_' + Date.now() + '.' + format;
        a.click();
        URL.revokeObjectURL(url);
        
        if (exportModal) exportModal.style.display = 'none';
        showStatus(`Exported as ${format.toUpperCase()}`, 'success');
    } catch (error) {
        showStatus('Export failed', 'error');
    }
}

function jsonToCSV(obj) {
    const arr = Array.isArray(obj) ? obj : [obj];
    if (arr.length === 0) return '';
    
    const headers = Object.keys(arr[0]);
    const csv = [headers.join(',')];
    
    arr.forEach(row => {
        const values = headers.map(h => {
            const val = row[h];
            return typeof val === 'object' ? JSON.stringify(val) : val;
        });
        csv.push(values.join(','));
    });
    
    return csv.join('\n');
}

function jsonToXML(obj, rootName = 'root') {
    let xml = '<?xml version="1.0" encoding="UTF-8"?>\n';
    
    function convert(obj, name) {
        let result = `<${name}>`;
        
        if (typeof obj === 'object' && obj !== null) {
            if (Array.isArray(obj)) {
                obj.forEach(item => {
                    result += convert(item, 'item');
                });
            } else {
                Object.keys(obj).forEach(key => {
                    result += convert(obj[key], key);
                });
            }
        } else {
            result += obj;
        }
        
        result += `</${name}>`;
        return result;
    }
    
    return xml + convert(obj, rootName);
}

function jsonToYAML(obj, indent = 0) {
    let yaml = '';
    const spaces = '  '.repeat(indent);
    
    if (Array.isArray(obj)) {
        obj.forEach(item => {
            yaml += `${spaces}- `;
            if (typeof item === 'object' && item !== null) {
                yaml += '\n' + jsonToYAML(item, indent + 1);
            } else {
                yaml += item + '\n';
            }
        });
    } else if (typeof obj === 'object' && obj !== null) {
        Object.keys(obj).forEach(key => {
            yaml += `${spaces}${key}: `;
            if (typeof obj[key] === 'object' && obj[key] !== null) {
                yaml += '\n' + jsonToYAML(obj[key], indent + 1);
            } else {
                yaml += obj[key] + '\n';
            }
        });
    }
    
    return yaml;
}

function validateSchema() {
    if (!currentJSON || !schemaInput) return;
    
    const schemaText = schemaInput.value.trim();
    if (!schemaText) {
        showStatus('Please enter a JSON schema', 'error');
        return;
    }
    
    if (schemaText.length > MAX_FILE_SIZE) {
        showStatus('Schema too large. Maximum 10MB.', 'error');
        return;
    }
    
    // XSS prevention
    if (/<script|javascript:|onerror=/i.test(schemaText)) {
        showStatus('Invalid schema content detected.', 'error');
        return;
    }
    
    try {
        const schema = JSON.parse(schemaText);
        const isValid = validateAgainstSchema(currentJSON, schema);
        
        if (isValid) {
            showStatus('✓ JSON is valid against the schema', 'success');
        } else {
            showStatus('✗ JSON does not match the schema', 'error');
        }
    } catch (error) {
        showStatus('Schema validation failed', 'error');
    }
}

function validateAgainstSchema(data, schema, depth = 0) {
    if (depth > MAX_RECURSION_DEPTH) return true;
    
    if (schema.type) {
        const dataType = Array.isArray(data) ? 'array' : typeof data;
        if (dataType !== schema.type) return false;
    }
    
    if (schema.required && typeof data === 'object') {
        for (const key of schema.required) {
            if (!(key in data)) return false;
        }
    }
    
    if (schema.properties && typeof data === 'object') {
        for (const key in schema.properties) {
            if (key in data) {
                if (!validateAgainstSchema(data[key], schema.properties[key], depth + 1)) {
                    return false;
                }
            }
        }
    }
    
    return true;
}

function executeJSONPath() {
    if (!currentJSON || !jsonPathInput || !queryResult) return;
    
    const path = jsonPathInput.value.trim();
    if (!path) {
        showStatus('Please enter a JSON path', 'error');
        return;
    }
    
    if (path.length > 500) {
        showStatus('Path too long. Maximum 500 characters.', 'error');
        return;
    }
    
    try {
        const result = evaluateJSONPath(currentJSON, path);
        const resultString = JSON.stringify(result, null, 2);
        if (resultString.length > 100000) {
            queryResult.textContent = 'Result too large to display (' + resultString.length + ' chars)';
        } else {
            queryResult.textContent = resultString;
        }
        showStatus('Query executed successfully', 'success');
    } catch (error) {
        queryResult.textContent = `Error: ${error.message}`;
        showStatus('Query failed', 'error');
    }
}

function evaluateJSONPath(obj, path) {
    if (path === '$') return obj;
    
    // Prevent prototype pollution
    if (path.includes('__proto__') || path.includes('constructor') || path.includes('prototype')) {
        throw new Error('Invalid path');
    }
    
    path = path.replace(/^\$\.?/, '');
    const parts = path.split('.');
    let result = obj;
    let depth = 0;
    
    for (const part of parts) {
        if (depth++ > MAX_RECURSION_DEPTH) throw new Error('Path too deep');
        
        if (part.includes('[')) {
            const [key, index] = part.split('[');
            const idx = parseInt(index.replace(']', ''));
            if (isNaN(idx) || idx < 0 || idx > 10000) throw new Error('Invalid index');
            result = key ? result[key][idx] : result[idx];
        } else if (part === '*') {
            result = Object.values(result);
        } else {
            result = result[part];
        }
        
        if (result === undefined) throw new Error('Path not found');
    }
    
    return result;
}

if (jsonInput) {
    jsonInput.value = `{
  "name": "John Doe",
  "age": 30,
  "isActive": true,
  "address": {
    "street": "123 Main St",
    "city": "New York",
    "zipCode": "10001"
  },
  "hobbies": ["reading", "swimming", "coding"],
  "spouse": null
}`;
    
    validateAndRender();
    updateLineNumbers();
    updateCursorPosition();
    updateCharCount();
}
