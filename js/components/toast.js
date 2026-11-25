import { escapeHtml } from '../config.js';

/**
 * Stacked Toast Notification System
 */

export function showToast(message, options = {}) {
    const container = document.getElementById('toastContainer');
    if (!container) return;

    const {
        type = 'info', // 'info' | 'success' | 'error' | 'warning'
        duration = 2800,
        actionLabel = null,
        onAction = null
    } = options;

    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.setAttribute('role', 'status');

    const msgSpan = document.createElement('span');
    msgSpan.innerHTML = escapeHtml(message);
    toast.appendChild(msgSpan);

    if (actionLabel && typeof onAction === 'function') {
        const btn = document.createElement('button');
        btn.type = 'button';
        btn.className = 'btn btn-xs btn-primary';
        btn.textContent = actionLabel;
        btn.addEventListener('click', () => {
            onAction();
            dismiss();
        });
        toast.appendChild(btn);
    }

    container.appendChild(toast);

    // Keep max 4 visible toasts
    while (container.children.length > 4) {
        container.firstElementChild?.remove();
    }

    let removed = false;
    function dismiss() {
        if (removed) return;
        removed = true;
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(20px)';
        toast.style.transition = 'all 0.2s ease';
        setTimeout(() => toast.remove(), 220);
    }

    if (duration > 0) {
        setTimeout(dismiss, duration);
    }
    return dismiss;
}
