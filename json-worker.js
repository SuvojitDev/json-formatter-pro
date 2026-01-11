self.onmessage = function(e) {
    const { action, data } = e.data;
    
    try {
        if (action === 'parse') {
            const parsed = JSON.parse(data);
            self.postMessage({ success: true, data: parsed });
        } else if (action === 'stringify') {
            const stringified = JSON.stringify(data, null, 2);
            self.postMessage({ success: true, data: stringified });
        }
    } catch (error) {
        self.postMessage({ success: false, error: error.message });
    }
};
