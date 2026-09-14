import { state } from './state.js';
import { currentTeamId, normalizeTeamId } from './model.js';

export function apiFetch(url, opts) {
    opts = opts || {};
    if (!opts.credentials) opts.credentials = 'same-origin';
    return fetch(url, opts).then(function(res) {
        if (res.status === 401) {
            var path = String(url || '');
            if (
                path.indexOf('/api/auth/login') === -1
                && path.indexOf('/api/auth/status') === -1
                && path.indexOf('/api/auth/setup') === -1
            ) {
                window.location.href = '/login';
            }
        }
        return res;
    });
}

export function currentProjectKey() {
    var el = document.getElementById('projectKey');
    var fromInput = el ? String(el.value || '').trim().toUpperCase() : '';
    if (el && fromInput && el.value !== fromInput) el.value = fromInput;
    return fromInput || String(state.currentProjectKey || '').toUpperCase();
}

export function canSeeDiagnostics() {
    var home = String(state.homeProjectKey || 'DGD').toUpperCase();
    var cur = currentProjectKey();
    return !!home && !!cur && cur === home && currentTeamId() === 'komplayns';
}

export function applyDiagnosticsVisibility() {
    var ok = canSeeDiagnostics();
    document.body.classList.toggle('hide-diag-analytics', !ok);
    if (!ok && typeof window.closeNk303 === 'function') {
        var p = String(location.pathname || '').replace(/\/+$/, '');
        if (p === '/diaqnostika' || p === '/diaqnostika/admin') window.closeNk303();
    }
}

export function applySessionChrome(cfg) {
    cfg = cfg || {};
    if (cfg.user) state.currentUser = cfg.user;
    if (cfg.homeProjectKey) state.homeProjectKey = String(cfg.homeProjectKey).toUpperCase();
    if (cfg.projectKey) state.currentProjectKey = String(cfg.projectKey).toUpperCase();
    if (cfg.currentProjectKey) state.currentProjectKey = String(cfg.currentProjectKey).toUpperCase();
    if (cfg.currentTeam) state.currentTeam = normalizeTeamId(cfg.currentTeam);
    else if (cfg.user && cfg.user.team) state.currentTeam = normalizeTeamId(cfg.user.team);
    if (typeof cfg.hasToken === 'boolean') state.hasServerToken = cfg.hasToken;
    var teamEl = document.getElementById('teamFilter');
    if (teamEl && state.currentTeam) teamEl.value = state.currentTeam;
    var user = state.currentUser;
    var nameEl = document.getElementById('appUserName');
    var roleEl = document.getElementById('appUserRole');
    var adminLink = document.getElementById('adminUsersLink');
    if (nameEl) nameEl.textContent = (user && (user.displayName || user.username)) || '—';
    if (roleEl) roleEl.textContent = user && user.role === 'admin' ? 'Admin' : 'İstifadəçi';
    if (adminLink) {
        if (user && user.role === 'admin') adminLink.classList.remove('hidden');
        else adminLink.classList.add('hidden');
    }
    var pat = document.getElementById('pat');
    var settingsBtn = document.getElementById('settingsBtn');
    if (state.hasServerToken) {
        if (pat) pat.placeholder = 'Server token aktivdir — boş saxlaya bilərsiniz';
        if (settingsBtn) settingsBtn.title = 'Serverdə Jira tokeni var. Öz tokeninizi yazmaq istəyə bağlıdır.';
    }
    applyDiagnosticsVisibility();
}

export async function rememberCurrentProject() {
    var key = currentProjectKey();
    var team = currentTeamId();
    if (!key) return null;
    state.currentProjectKey = key;
    state.currentTeam = team;
    try {
        var res = await apiFetch('/api/auth/project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ projectKey: key, team: team })
        });
        if (res.ok) {
            var data = await res.json();
            if (data.homeProjectKey) state.homeProjectKey = String(data.homeProjectKey).toUpperCase();
            if (data.currentProjectKey) state.currentProjectKey = String(data.currentProjectKey).toUpperCase();
            if (data.currentTeam) state.currentTeam = normalizeTeamId(data.currentTeam);
        }
    } catch (e) { /* session update is best-effort */ }
    applyDiagnosticsVisibility();
    return key;
}

export async function logoutApp() {
    try {
        await apiFetch('/api/auth/logout', { method: 'POST' });
    } catch (e) { /* still leave the page */ }
    window.location.href = '/login';
}
