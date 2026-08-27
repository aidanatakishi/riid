import { state } from './state.js';
import { getStatusGroup } from './model.js';

export function showToast(message, type) {
    type = type || 'info';
    var container = document.getElementById('toastContainer');
    var toast = document.createElement('div');
    var colors = { info: 'bg-indigo-600', success: 'bg-emerald-500', error: 'bg-red-500' };
    toast.className = 'toast ' + colors[type] + ' cursor-pointer';
    toast.innerText = message;
    toast.onclick = function() { toast.remove(); };
    container.appendChild(toast);
    var ttl = type === 'error' ? 14000 : 4000;
    setTimeout(function() {
        toast.style.transition = 'all 0.4s ease';
        toast.style.opacity = '0';
        toast.style.transform = 'translateX(120%)';
        setTimeout(function() { toast.remove(); }, 400);
    }, ttl);
}

export function animateValue(id, start, end, duration) {
    var obj = document.getElementById(id);
    if (!obj) return;
    var startTimestamp = null;
    var step = function(timestamp) {
        if (!startTimestamp) startTimestamp = timestamp;
        var progress = Math.min((timestamp - startTimestamp) / duration, 1);
        obj.innerText = Math.floor(progress * (end - start) + start);
        if (progress < 1) {
            window.requestAnimationFrame(step);
        } else {
            obj.innerText = end;
        }
    };
    window.requestAnimationFrame(step);
}

export function normalizeStr(str) {
    if (!str) return '';
    return str.trim().toLocaleLowerCase('az').replace(/i̇/g, 'i');
}

export function toggleSettings() {
    var panel = document.getElementById('settingsPanel');
    panel.classList.toggle('hidden');
    if (!panel.classList.contains('hidden')) panel.classList.add('slide-down');
}

export function getInitials(name) {
    if (!name || name === 'Təyin edilməyib') return '?';
    return name.split(' ').map(function(p) { return p[0]; }).join('').toUpperCase().substring(0, 2);
}

export function getIssueTypeIcon(typeName) {
    var n = normalizeStr(typeName);
    if (n.includes('alt') || n.includes('sub')) return '<span class="w-4 h-4 inline-block"></span>';
    if (n.includes('bug')) return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-red-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M9 5H7a2 2 0 0 0-2 2v12a2 2 0 002 2h10a2 2 0 002-2V7a2 2 0 00-2-2h-2M9 5a2 2 0 002 2h2a2 2 0 002-2M9 5a2 2 0 012-2h2a2 2 0 012 2" /></svg>';
    return '<svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"><path stroke-linecap="round" stroke-linejoin="round" d="M13 5l7 7-7 7M5 5l7 7-7 7" /></svg>';
}

export function getStatusColor(statusName) {
    var g = getStatusGroup(statusName);
    return { 'planned': 'bg-orange-500', 'progress': 'bg-blue-500', 'review': 'bg-cyan-500', 'esd': 'bg-indigo-500', 'blocked': 'bg-red-500', 'paused': 'bg-amber-500', 'rejected': 'bg-rose-700', 'done': 'bg-emerald-500', 'other': 'bg-slate-400' }[g];
}

export function truncateChangeValue(str, max) {
    max = max || 40;
    if (!str) return 'Boş';
    var clean = String(str).replace(/\s+/g, ' ').trim();
    if (!clean) return 'Boş';
    return clean.length > max ? clean.slice(0, max) + '…' : clean;
}

export function getChangeFieldMeta(item) {
    var fieldName = (item.field || '').toLowerCase();
    if (fieldName === 'status') return { label: 'Status', badge: 'bg-blue-50 border-blue-200 text-blue-700', dot: 'bg-blue-500' };
    if (fieldName.indexOf('çətin') !== -1) return { label: 'Çətinlik', badge: 'bg-red-50 border-red-200 text-red-700', dot: 'bg-red-500' };
    if (fieldName.indexOf('qurum') !== -1) return { label: 'Qurum', badge: 'bg-cyan-50 border-cyan-200 text-cyan-700', dot: 'bg-cyan-500' };
    if (fieldName === 'description') return { label: 'Təsvir', badge: 'bg-amber-50 border-amber-200 text-amber-700', dot: 'bg-amber-500' };
    if (fieldName === 'priority') return { label: 'Prioritet', badge: 'bg-orange-50 border-orange-200 text-orange-700', dot: 'bg-orange-500' };
    if (fieldName === 'assignee') return { label: 'Təyinat', badge: 'bg-indigo-50 border-indigo-200 text-indigo-700', dot: 'bg-indigo-500' };
    if (fieldName === 'summary') return { label: 'Başlıq', badge: 'bg-emerald-50 border-emerald-200 text-emerald-700', dot: 'bg-emerald-500' };
    if (fieldName === 'labels') return { label: 'Etiket', badge: 'bg-pink-50 border-pink-200 text-pink-700', dot: 'bg-pink-500' };
    if (fieldName === 'duedate') return { label: 'Bitmə tarixi', badge: 'bg-yellow-50 border-yellow-200 text-yellow-700', dot: 'bg-yellow-500' };
    if (fieldName.indexOf('sprint') !== -1 || fieldName.indexOf('fix version') !== -1) return { label: 'Sprint', badge: 'bg-purple-50 border-purple-200 text-purple-700', dot: 'bg-purple-500' };
    if (fieldName === 'component' || fieldName === 'components') return { label: 'Komponent', badge: 'bg-teal-50 border-teal-200 text-teal-700', dot: 'bg-teal-500' };
    if (fieldName === 'link') return { label: 'Bağlantı', badge: 'bg-fuchsia-50 border-fuchsia-200 text-fuchsia-700', dot: 'bg-fuchsia-500' };
    return { label: item.field || 'Dəyişiklik', badge: 'bg-slate-100 border-slate-200 text-slate-700', dot: 'bg-slate-500' };
}
      

export function toggleDropdown(id) {
    var el = document.getElementById(id);
    var icon = document.getElementById('icon-' + id);
    if (!el) return;
    el.classList.toggle('hidden');
    if (!el.classList.contains('hidden')) {
        el.classList.add('slide-down');
        if (icon) icon.style.transform = 'rotate(180deg)';
        if (typeof state.onSectionOpen === 'function') state.onSectionOpen(id);
        setTimeout(function() {
            if (typeof state.statusChart !== 'undefined' && state.statusChart) state.statusChart.resize();
            if (typeof state.assigneeChart !== 'undefined' && state.assigneeChart) state.assigneeChart.resize();
            if (typeof state.epicChart !== 'undefined' && state.epicChart) state.epicChart.resize();
            if (typeof state.labelChart !== 'undefined' && state.labelChart) state.labelChart.resize();
            if (typeof state.qurumChart !== 'undefined' && state.qurumChart) state.qurumChart.resize();
        }, 300);
    } else {
        if (icon) icon.style.transform = 'rotate(0deg)';
    }
}
