import { state } from './state.js';
import { currentTeamId, normalizeTeamId } from './model.js';

export function loginPath() {
    var host = String(location.hostname || '');
    if (/netlify\.app$/i.test(host)) return '/login.html';
    return '/login';
}

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
                && path.indexOf('/api/auth/reset-password') === -1
                && path.indexOf('/api/auth/change-password') === -1
            ) {
                window.location.href = loginPath();
            }
        }
        return res;
    });
}

export async function requireSession() {
    var host = String(location.hostname || '');
    if (/netlify\.app$/i.test(host)) {
        if (String(location.pathname || '').indexOf('login') === -1) {
            window.location.replace(loginPath());
        }
        return false;
    }
    try {
        var res = await fetch('/api/auth/me', { credentials: 'same-origin' });
        var data = await res.json();
        if (data && data.authenticated) return true;
    } catch (e) { /* fall through to login */ }
    window.location.replace(loginPath());
    return false;
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
    return !!home && !!cur && cur === home;
}

export function applyDiagnosticsVisibility() {
    var ok = canSeeDiagnostics();
    document.body.classList.toggle('hide-diag-analytics', !ok);
    if (!ok && typeof window.closeNk303 === 'function') {
        var p = String(location.pathname || '').replace(/\/+$/, '');
        if (p === '/diaqnostika' || p === '/diaqnostika/admin') window.closeNk303();
    }
}

export function roleLabel(role) {
    if (role === 'superadmin') return 'Superadmin';
    if (role === 'admin') return 'Admin';
    return 'İstifadəçi';
}

export function canManageUsers(user) {
    user = user || state.currentUser;
    return !!(user && (user.canManageUsers || user.role === 'admin' || user.role === 'superadmin'));
}

export function canManageTech(user) {
    user = user || state.currentUser;
    return !!(user && (user.canManageTech || user.role === 'superadmin'));
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
    var tech = canManageTech(user);
    var manage = canManageUsers(user);
    if (nameEl) nameEl.textContent = (user && (user.displayName || user.username)) || '—';
    if (roleEl) roleEl.textContent = roleLabel(user && user.role);
    var jiraEl = document.getElementById('appUserJira');
    if (jiraEl) {
        if (user && user.jiraDisplayName) {
            jiraEl.textContent = 'Jira: ' + user.jiraDisplayName;
            jiraEl.classList.remove('hidden');
        } else {
            jiraEl.textContent = '';
            jiraEl.classList.add('hidden');
        }
    }
    if (adminLink) {
        adminLink.href = '/settings#users';
        adminLink.classList.toggle('hidden', !manage);
    }
    var manageLink = document.getElementById('manageSettingsLink');
    if (manageLink) {
        manageLink.href = manage ? '/settings#users' : '/settings';
    }
    var jiraBlock = document.getElementById('settingsJiraBlock');
    if (jiraBlock) jiraBlock.classList.toggle('hidden', !tech);
    var scopeBlock = document.getElementById('settingsScopeBlock');
    if (scopeBlock) scopeBlock.classList.toggle('hidden', !manage);
    try { localStorage.removeItem('jiraPat'); } catch (e) {}
    try { localStorage.removeItem('jiraChatApiKey'); } catch (e2) {}
    var pat = document.getElementById('pat');
    if (pat) pat.value = '';
    var settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.title = 'Tənzimləmələr';
        if (settingsBtn.tagName === 'A') settingsBtn.removeAttribute('href');
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
    window.location.href = loginPath();
}
