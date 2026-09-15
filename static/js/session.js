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
    if (adminLink) adminLink.classList.toggle('hidden', !manage);
    var passwordBlock = document.getElementById('settingsPasswordBlock');
    if (passwordBlock) passwordBlock.classList.toggle('hidden', !manage);
    var jiraBlock = document.getElementById('settingsJiraBlock');
    if (jiraBlock) jiraBlock.classList.toggle('hidden', !tech);
    var scopeBlock = document.getElementById('settingsScopeBlock');
    if (scopeBlock) scopeBlock.classList.toggle('hidden', !manage);
    try { localStorage.removeItem('jiraPat'); } catch (e) {}
    var pat = document.getElementById('pat');
    if (pat) pat.value = '';
    var settingsBtn = document.getElementById('settingsBtn');
    if (settingsBtn) {
        settingsBtn.title = tech ? 'Texniki ayarlar' : 'Hesab';
    }
    applyDiagnosticsVisibility();
}

function personOptionLabel(user) {
    var name = (user && (user.jiraDisplayName || user.displayName || user.username)) || '';
    var login = user && user.username ? String(user.username) : '';
    if (name && login && name !== login) return name + ' (' + login + ')';
    return name || login || '—';
}

export function fillSettingsPasswordUsers() {
    var sel = document.getElementById('settingsPasswordUser');
    var block = document.getElementById('settingsPasswordBlock');
    if (!sel || !block || block.classList.contains('hidden')) return Promise.resolve();
    var keep = sel.value;
    return apiFetch('/api/users').then(function(res) { return res.json().then(function(data) { return { ok: res.ok, data: data }; }); })
        .then(function(res) {
            if (!res.ok) return;
            var users = (res.data && res.data.users) || [];
            users.sort(function(a, b) {
                return personOptionLabel(a).localeCompare(personOptionLabel(b), 'az');
            });
            sel.innerHTML = '<option value="">Ad seçin</option>' + users.map(function(u) {
                return '<option value="' + String(u.id || '').replace(/"/g, '&quot;') + '">'
                    + personOptionLabel(u).replace(/&/g, '&amp;').replace(/</g, '&lt;') + '</option>';
            }).join('');
            if (keep && users.some(function(u) { return u.id === keep; })) sel.value = keep;
        })
        .catch(function() {});
}

export function onSettingsOpened() {
    fillSettingsPasswordUsers();
}

export async function changeSelectedUserPassword(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var sel = document.getElementById('settingsPasswordUser');
    var newEl = document.getElementById('settingsNewPassword');
    var confirmEl = document.getElementById('settingsConfirmPassword');
    var msg = document.getElementById('settingsPasswordMsg');
    var btn = document.getElementById('settingsPasswordBtn');
    function setMsg(text, ok) {
        if (!msg) return;
        msg.textContent = text || '';
        msg.classList.toggle('is-ok', !!ok && !!text);
        msg.classList.toggle('is-err', !ok && !!text);
    }
    var userId = sel ? String(sel.value || '').trim() : '';
    var password = newEl ? String(newEl.value || '') : '';
    var confirmPassword = confirmEl ? String(confirmEl.value || '') : '';
    if (!userId) {
        setMsg('Əvvəl şəxsin adını seçin', false);
        return;
    }
    if (password.length < 6) {
        setMsg('Parol ən azı 6 simvol olmalıdır', false);
        return;
    }
    if (password !== confirmPassword) {
        setMsg('Yeni parollar eyni deyil', false);
        return;
    }
    if (btn) btn.disabled = true;
    setMsg('', false);
    try {
        var res = await apiFetch('/api/users/' + encodeURIComponent(userId), {
            method: 'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ password: password })
        });
        var data = {};
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok) {
            setMsg((data && data.error) || 'Parol dəyişmədi', false);
            return;
        }
        if (newEl) newEl.value = '';
        if (confirmEl) confirmEl.value = '';
        setMsg('Parol yeniləndi', true);
        if (typeof window.showToast === 'function') window.showToast('Parol yeniləndi', 'success');
    } catch (e) {
        setMsg('Serverə qoşulmaq mümkün olmadı', false);
    } finally {
        if (btn) btn.disabled = false;
    }
}

export async function changeOwnPassword(ev) {
    if (ev && ev.preventDefault) ev.preventDefault();
    var currentEl = document.getElementById('ownCurrentPassword');
    var newEl = document.getElementById('ownNewPassword');
    var confirmEl = document.getElementById('ownConfirmPassword');
    var msg = document.getElementById('ownPasswordMsg');
    var btn = document.getElementById('ownPasswordBtn');
    function setMsg(text, ok) {
        if (!msg) return;
        msg.textContent = text || '';
        msg.classList.toggle('is-ok', !!ok && !!text);
        msg.classList.toggle('is-err', !ok && !!text);
    }
    var currentPassword = currentEl ? String(currentEl.value || '') : '';
    var password = newEl ? String(newEl.value || '') : '';
    var confirmPassword = confirmEl ? String(confirmEl.value || '') : '';
    if (!currentPassword) {
        setMsg('Cari parol lazımdır', false);
        return;
    }
    if (password.length < 6) {
        setMsg('Parol ən azı 6 simvol olmalıdır', false);
        return;
    }
    if (password !== confirmPassword) {
        setMsg('Yeni parollar eyni deyil', false);
        return;
    }
    if (btn) btn.disabled = true;
    setMsg('', false);
    try {
        var res = await apiFetch('/api/auth/change-password', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                currentPassword: currentPassword,
                password: password,
                confirmPassword: confirmPassword
            })
        });
        var data = {};
        try { data = await res.json(); } catch (e) { data = {}; }
        if (!res.ok) {
            setMsg((data && data.error) || 'Parol dəyişmədi', false);
            return;
        }
        if (currentEl) currentEl.value = '';
        if (newEl) newEl.value = '';
        if (confirmEl) confirmEl.value = '';
        setMsg('Parol yeniləndi', true);
        if (typeof window.showToast === 'function') window.showToast('Parol yeniləndi', 'success');
    } catch (e) {
        setMsg('Serverə qoşulmaq mümkün olmadı', false);
    } finally {
        if (btn) btn.disabled = false;
    }
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
