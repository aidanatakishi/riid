(function () {
    var editingId = '';
    var homeProjectKey = 'DGD';
    var peopleCache = {};
    var peopleLoading = false;
    var peopleReq = 0;
    var me = {};
    var canManage = false;
    var canTech = false;

    function showError(id, msg) {
        var el = document.getElementById(id);
        if (!el) return;
        el.textContent = msg || '';
        el.classList.toggle('is-on', !!msg);
    }
    function esc(s) {
        return String(s == null ? '' : s)
            .replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');
    }
    function initials(name) {
        var parts = String(name || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return 'U';
        if (parts.length === 1) return parts[0].slice(0, 2).toUpperCase();
        return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
    }
    function api(url, opts) {
        opts = opts || {};
        opts.credentials = 'same-origin';
        opts.headers = opts.headers || {};
        return fetch(url, opts).then(function (r) {
            if (r.status === 401) { window.location.href = '/login'; }
            return r.json().then(function (data) { return { ok: r.ok, status: r.status, data: data }; }).catch(function () {
                return { ok: r.ok, status: r.status, data: {} };
            });
        });
    }
    function activeView() {
        var hash = String(location.hash || '').replace('#', '');
        if (hash === 'users' && canManage) return 'users';
        return 'scope';
    }
    function setView(view) {
        if (view === 'users' && !canManage) view = 'scope';
        var isUsers = view === 'users';
        document.getElementById('view-scope').classList.toggle('hidden', isUsers);
        document.getElementById('view-users').classList.toggle('hidden', !isUsers);
        document.getElementById('navScope').classList.toggle('is-on', !isUsers);
        var navUsers = document.getElementById('navUsers');
        if (navUsers) navUsers.classList.toggle('is-on', isUsers);
        document.getElementById('setTitle').textContent = isUsers ? 'İstifadəçilər' : 'Layihə və komanda';
        document.getElementById('setSub').textContent = isUsers
            ? 'Hesablar, rollar və hər kəsə verilən access-lər.'
            : 'Jira KEY və komanda bu panelin əhatəsini müəyyən edir.';
        if (isUsers && location.hash !== '#users') history.replaceState(null, '', '#users');
        if (!isUsers && location.hash && location.hash !== '#scope') history.replaceState(null, '', '#scope');
    }
    function setTokenStatus(hasToken, hasStoreToken) {
        var status = document.getElementById('tokenStatus');
        var clearBtn = document.getElementById('clearTokenBtn');
        if (hasToken) {
            status.textContent = 'Tokeniniz yadda saxlanıb. Növbəti girişdə yenidən yazmaq lazım deyil.';
            status.className = 'admin-status is-ok';
        } else {
            status.textContent = 'Token təyin edilməyib. Öz Jira tokeninizi yazın; bir dəfə yazmağınız kifayətdir.';
            status.className = 'admin-status is-warn';
        }
        if (clearBtn) clearBtn.classList.toggle('hidden', !hasStoreToken);
    }
    function loadTokenStatus() {
        return api('/api/jira/token').then(function (res) {
            if (!res.ok) return;
            setTokenStatus(!!res.data.hasToken, !!res.data.hasToken);
        });
    }
    function selectedTeam() {
        return document.getElementById('team').value || 'komplayns';
    }
    function cacheKey() {
        var project = String(document.getElementById('userProjectKey').value || homeProjectKey).toUpperCase();
        return project + ':' + selectedTeam();
    }
    function personById(accountId) {
        if (!accountId) return null;
        var list = (peopleCache[cacheKey()] || []).slice();
        if (peopleCache._extra) list.push(peopleCache._extra);
        var i;
        for (i = 0; i < list.length; i++) {
            if (String(list[i].accountId || '') === String(accountId)) return list[i];
        }
        return null;
    }
    function selectedPerson() {
        var sel = document.getElementById('jiraPerson');
        return personById(sel ? sel.value : '');
    }
    function setJiraHidden(accountId, displayName) {
        document.getElementById('jiraAccountId').value = accountId || '';
        document.getElementById('jiraDisplayName').value = displayName || '';
        var chip = document.getElementById('jiraChip');
        if (accountId && displayName) {
            chip.textContent = 'Jira: ' + displayName;
            chip.classList.remove('hidden');
        } else {
            chip.textContent = '';
            chip.classList.add('hidden');
        }
    }
    function applyMode() {
        var person = selectedPerson();
        var note = document.getElementById('modeNote');
        var username = document.getElementById('username');
        if (person && person.accountId) {
            if (!editingId && person.suggestedUsername && !username.dataset.locked) {
                username.value = person.suggestedUsername;
            }
            setJiraHidden(person.accountId, person.displayName || '');
            if (person.linkedUserId && person.linkedUserId !== editingId) {
                note.textContent = 'Bu Jira şəxsinin artıq hesabı var (' + (person.linkedUsername || '') + '). Başqasını seçin və ya mövcud hesabı redaktə edin.';
            } else {
                note.textContent = 'Hesab Jira-dakı «' + (person.displayName || '') + '» ilə bağlanacaq.';
            }
        } else {
            setJiraHidden('', '');
            note.textContent = 'Siyahıda yoxdursa yalnız istifadəçi adı və parol yazın. Jira ilə bağlanmayacaq.';
        }
    }
    function fillPeopleOptions(people, selectedId) {
        var sel = document.getElementById('jiraPerson');
        sel.innerHTML = '';
        var empty = document.createElement('option');
        empty.value = '';
        empty.textContent = 'Siyahıda yoxdur — statik hesab';
        sel.appendChild(empty);
        var found = false;
        (people || []).forEach(function (person) {
            var opt = document.createElement('option');
            opt.value = person.accountId || '';
            opt.textContent = (person.displayName || person.accountId || '')
                + (person.linkedUsername ? ' — hesab var' : '');
            if (selectedId && String(person.accountId) === String(selectedId)) {
                opt.selected = true;
                found = true;
            }
            sel.appendChild(opt);
        });
        if (selectedId && !found) {
            peopleCache._extra = {
                accountId: selectedId,
                displayName: document.getElementById('jiraDisplayName').value || selectedId,
                suggestedUsername: '',
                linkedUserId: editingId,
                linkedUsername: ''
            };
            var extra = document.createElement('option');
            extra.value = selectedId;
            extra.selected = true;
            extra.textContent = peopleCache._extra.displayName;
            sel.appendChild(extra);
        } else {
            peopleCache._extra = null;
        }
        applyMode();
    }
    function loadPeople() {
        if (!canManage) return Promise.resolve();
        var project = String(document.getElementById('userProjectKey').value || homeProjectKey).toUpperCase();
        var team = selectedTeam();
        var key = cacheKey();
        var req = ++peopleReq;
        if (peopleCache[key]) {
            fillPeopleOptions(peopleCache[key], document.getElementById('jiraAccountId').value);
            return Promise.resolve();
        }
        var sel = document.getElementById('jiraPerson');
        sel.innerHTML = '<option value="">Yüklənir…</option>';
        peopleLoading = true;
        return api('/api/jira/component-people?team=' + encodeURIComponent(team) + '&project=' + encodeURIComponent(project)).then(function (res) {
            if (req !== peopleReq) return;
            peopleLoading = false;
            if (!res.ok) {
                sel.innerHTML = '<option value="">Siyahıda yoxdur — statik hesab</option>';
                applyMode();
                return;
            }
            peopleCache[key] = res.data.people || [];
            fillPeopleOptions(peopleCache[key], document.getElementById('jiraAccountId').value);
        }).catch(function () {
            if (req !== peopleReq) return;
            peopleLoading = false;
            sel.innerHTML = '<option value="">Siyahıda yoxdur — statik hesab</option>';
            applyMode();
        });
    }
    function resetForm() {
        editingId = '';
        document.getElementById('userId').value = '';
        document.getElementById('username').value = '';
        document.getElementById('username').dataset.locked = '';
        document.getElementById('password').value = '';
        document.getElementById('password').placeholder = 'Ən azı 6 simvol';
        document.getElementById('password').required = true;
        document.getElementById('userProjectKey').value = homeProjectKey;
        document.getElementById('team').value = 'komplayns';
        document.getElementById('role').value = 'user';
        document.getElementById('role').disabled = false;
        setJiraHidden('', '');
        document.getElementById('formTitle').textContent = 'Yeni hesab';
        document.getElementById('saveBtn').textContent = 'Əlavə et';
        document.getElementById('cancelEditBtn').classList.add('hidden');
        showError('formError', '');
        loadPeople();
    }
    function fillEdit(user) {
        editingId = user.id;
        document.getElementById('username').value = user.username || '';
        document.getElementById('username').dataset.locked = '1';
        document.getElementById('password').value = '';
        document.getElementById('password').required = false;
        document.getElementById('password').placeholder = 'Boş saxlasanız dəyişməz';
        document.getElementById('userProjectKey').value = user.projectKey || homeProjectKey;
        document.getElementById('team').value = user.team || 'komplayns';
        document.getElementById('role').value = user.role === 'admin' ? 'admin' : 'user';
        document.getElementById('role').disabled = user.role === 'superadmin';
        setJiraHidden(user.jiraAccountId || '', user.jiraDisplayName || '');
        document.getElementById('formTitle').textContent = 'Hesabı redaktə et';
        document.getElementById('saveBtn').textContent = 'Yadda saxla';
        document.getElementById('cancelEditBtn').classList.remove('hidden');
        showError('formError', '');
        loadPeople();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    }
    function teamLabel(user) {
        if (user.teamLabel) return user.teamLabel;
        var id = String(user.team || '');
        if (id === 'komplayns') return 'Komplayns';
        if (id === 'koordinasiya') return 'Koordinasiya';
        if (id === 'servis-dizayn') return 'Servis dizayn';
        return id;
    }
    function roleLabel(user) {
        if (user.roleLabel) return user.roleLabel;
        if (user.role === 'superadmin') return 'Superadmin';
        if (user.role === 'admin') return 'Admin';
        return 'İstifadəçi';
    }
    function renderRows(users) {
        var box = document.getElementById('userRows');
        box.innerHTML = '';
        if (!(users || []).length) {
            box.innerHTML = '<p class="admin-empty">Hələ hesab yoxdur</p>';
            return;
        }
        (users || []).forEach(function (user) {
            var row = document.createElement('article');
            var privileged = user.role === 'admin' || user.role === 'superadmin';
            row.className = 'admin-person' + (privileged ? ' is-admin' : '');
            var name = user.jiraDisplayName || user.displayName || user.username || '';
            var roleText = roleLabel(user);
            var teamText = teamLabel(user);
            row.innerHTML =
                '<span class="admin-avatar">' + esc(initials(name)) + '</span>' +
                '<div class="admin-person-copy">' +
                '<h3>' + esc(name) + '</h3>' +
                '<div class="admin-meta">' +
                '<span class="admin-badge' + (privileged ? ' is-admin' : '') + '">' + esc(roleText) + '</span>' +
                (teamText ? '<span class="admin-badge">' + esc(teamText) + '</span>' : '') +
                '</div></div><div class="admin-person-actions"></div>';
            var actions = row.querySelector('.admin-person-actions');
            var editBtn = document.createElement('button');
            editBtn.type = 'button';
            editBtn.className = 'admin-btn admin-btn--ghost';
            editBtn.textContent = 'Redaktə';
            editBtn.addEventListener('click', function () { fillEdit(user); });
            actions.appendChild(editBtn);
            if (user.role !== 'superadmin') {
                var delBtn = document.createElement('button');
                delBtn.type = 'button';
                delBtn.className = 'admin-btn admin-btn--danger';
                delBtn.textContent = 'Sil';
                delBtn.addEventListener('click', function () { askRemoveUser(user); });
                actions.appendChild(delBtn);
            }
            box.appendChild(row);
        });
    }
    function loadUsers() {
        if (!canManage) return Promise.resolve();
        return api('/api/users').then(function (res) {
            if (!res.ok) {
                showError('listError', (res.data && res.data.error) || 'Siyahı yüklənmədi');
                return;
            }
            if (res.data.homeProjectKey) {
                homeProjectKey = res.data.homeProjectKey;
                if (!editingId) document.getElementById('userProjectKey').value = homeProjectKey;
            }
            renderRows(res.data.users || []);
        });
    }
    var pendingDelete = null;
    function deleteOverlay() {
        return document.getElementById('deleteOverlay');
    }
    function closeDeleteModal() {
        pendingDelete = null;
        var overlay = deleteOverlay();
        if (!overlay) return;
        overlay.classList.add('hidden');
        overlay.setAttribute('hidden', '');
    }
    function askRemoveUser(user) {
        if (!user || !user.id) return;
        pendingDelete = user;
        var overlay = deleteOverlay();
        if (!overlay) return;
        var name = user.jiraDisplayName || user.displayName || user.username || 'Bu hesab';
        document.getElementById('deleteTitle').textContent = 'Hesabı sil';
        document.getElementById('deleteText').textContent = name + ' hesabı silinəcək. Bu əməliyyat geri qaytarılmır.';
        overlay.classList.remove('hidden');
        overlay.removeAttribute('hidden');
        var confirmBtn = document.getElementById('deleteConfirmBtn');
        if (confirmBtn) confirmBtn.focus();
    }
    function removeUser(user) {
        if (!user || !user.id) return;
        api('/api/users/' + encodeURIComponent(user.id), { method: 'DELETE' }).then(function (res) {
            if (!res.ok) {
                showError('listError', (res.data && res.data.error) || 'Silinmədi');
                return;
            }
            if (editingId === user.id) resetForm();
            loadUsers();
        });
    }
    function applyScopeChrome() {
        var projectEl = document.getElementById('scopeProjectKey');
        var teamEl = document.getElementById('scopeTeam');
        var projectRead = document.getElementById('scopeProjectRead');
        var teamRead = document.getElementById('scopeTeamRead');
        var actions = document.getElementById('scopeActions');
        if (!canManage) {
            projectEl.classList.add('hidden');
            teamEl.classList.add('hidden');
            projectRead.classList.remove('hidden');
            teamRead.classList.remove('hidden');
            actions.classList.add('hidden');
        }
        projectRead.textContent = projectEl.value || '—';
        var opt = teamEl.options[teamEl.selectedIndex];
        teamRead.textContent = opt ? opt.textContent : '—';
    }
    function saveScope() {
        if (!canManage) return;
        var btn = document.getElementById('saveScopeBtn');
        var ok = document.getElementById('scopeOk');
        showError('scopeError', '');
        ok.textContent = '';
        btn.disabled = true;
        var key = String(document.getElementById('scopeProjectKey').value || '').trim().toUpperCase();
        document.getElementById('scopeProjectKey').value = key;
        api('/api/auth/project', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectKey: key,
                team: document.getElementById('scopeTeam').value
            })
        }).then(function (res) {
            btn.disabled = false;
            if (!res.ok) {
                showError('scopeError', (res.data && res.data.error) || 'Yadda saxlanılmadı');
                return;
            }
            if (res.data.currentProjectKey) document.getElementById('scopeProjectKey').value = res.data.currentProjectKey;
            if (res.data.currentTeam) document.getElementById('scopeTeam').value = res.data.currentTeam;
            applyScopeChrome();
            ok.textContent = 'Əhatə yadda saxlandı.';
        }).catch(function () {
            btn.disabled = false;
            showError('scopeError', 'Serverə qoşulmaq mümkün olmadı');
        });
    }

    document.getElementById('navScope').addEventListener('click', function (ev) {
        ev.preventDefault();
        setView('scope');
    });
    document.getElementById('navUsers').addEventListener('click', function (ev) {
        ev.preventDefault();
        setView('users');
    });
    window.addEventListener('hashchange', function () { setView(activeView()); });
    document.getElementById('saveScopeBtn').addEventListener('click', saveScope);
    document.getElementById('team').addEventListener('change', function () {
        showError('formError', '');
        if (!editingId) {
            setJiraHidden('', '');
            document.getElementById('username').dataset.locked = '';
        }
        loadPeople();
    });
    document.getElementById('jiraPerson').addEventListener('change', applyMode);
    document.getElementById('username').addEventListener('input', function () {
        document.getElementById('username').dataset.locked = '1';
    });
    document.getElementById('cancelEditBtn').addEventListener('click', resetForm);
    document.getElementById('logoutBtn').addEventListener('click', function () {
        api('/api/auth/logout', { method: 'POST' }).finally(function () {
            window.location.href = '/login';
        });
    });
    document.getElementById('deleteCancelBtn').addEventListener('click', closeDeleteModal);
    document.getElementById('deleteConfirmBtn').addEventListener('click', function () {
        var user = pendingDelete;
        closeDeleteModal();
        if (user) removeUser(user);
    });
    document.getElementById('deleteOverlay').addEventListener('click', function (ev) {
        if (ev.target === ev.currentTarget) closeDeleteModal();
    });
    document.addEventListener('keydown', function (ev) {
        if (ev.key === 'Escape' && pendingDelete) closeDeleteModal();
    });
    document.getElementById('userForm').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var btn = document.getElementById('saveBtn');
        btn.disabled = true;
        showError('formError', '');
        var person = selectedPerson();
        if (person && person.linkedUserId && person.linkedUserId !== editingId) {
            btn.disabled = false;
            showError('formError', 'Bu Jira şəxsinin artıq hesabı var.');
            return;
        }
        var username = document.getElementById('username').value.trim();
        var jiraId = (person && person.accountId) || document.getElementById('jiraAccountId').value || '';
        var jiraName = (person && person.displayName) || document.getElementById('jiraDisplayName').value || '';
        var payload = {
            username: username,
            displayName: jiraName || username,
            projectKey: String(document.getElementById('userProjectKey').value || homeProjectKey).toUpperCase(),
            team: document.getElementById('team').value || 'komplayns',
            role: document.getElementById('role').value,
            jiraAccountId: jiraId,
            jiraDisplayName: jiraName
        };
        var password = document.getElementById('password').value;
        if (password) payload.password = password;
        var req;
        if (editingId) {
            req = api('/api/users/' + encodeURIComponent(editingId), {
                method: 'PATCH',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        } else {
            if (!payload.password) {
                btn.disabled = false;
                showError('formError', 'Yeni istifadəçi üçün parol yazın');
                return;
            }
            req = api('/api/users', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(payload)
            });
        }
        req.then(function (res) {
            btn.disabled = false;
            if (!res.ok) {
                showError('formError', (res.data && res.data.error) || 'Yadda saxlanılmadı');
                return;
            }
            peopleCache = {};
            resetForm();
            loadUsers();
        }).catch(function () {
            btn.disabled = false;
            showError('formError', 'Serverə qoşulmaq mümkün olmadı');
        });
    });
    document.getElementById('tokenForm').addEventListener('submit', function (ev) {
        ev.preventDefault();
        var btn = document.getElementById('saveTokenBtn');
        var token = document.getElementById('sharedPat').value;
        btn.disabled = true;
        showError('tokenError', '');
        api('/api/jira/token', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ pat: token })
        }).then(function (res) {
            btn.disabled = false;
            if (!res.ok) {
                showError('tokenError', (res.data && res.data.error) || 'Token yadda saxlanılmadı');
                return;
            }
            document.getElementById('sharedPat').value = '';
            setTokenStatus(true, true);
            peopleCache = {};
            loadPeople();
        }).catch(function () {
            btn.disabled = false;
            showError('tokenError', 'Serverə qoşulmaq mümkün olmadı');
        });
    });
    document.getElementById('clearTokenBtn').addEventListener('click', function () {
        if (!confirm('Öz Jira tokeniniz silinsin? Növbəti dəfə daxil olanda yenidən yazmalı olacaqsınız.')) return;
        api('/api/jira/token', { method: 'DELETE' }).then(function (res) {
            if (!res.ok) {
                showError('tokenError', (res.data && res.data.error) || 'Silinmədi');
                return;
            }
            setTokenStatus(!!res.data.hasToken, false);
            peopleCache = {};
            loadPeople();
        });
    });

    api('/api/auth/me').then(function (res) {
        if (!res.ok || !res.data.authenticated) { window.location.href = '/login'; return; }
        me = res.data.user || {};
        canManage = !!(me.canManageUsers || me.role === 'admin' || me.role === 'superadmin');
        canTech = !!(me.canManageTech || me.role === 'superadmin');
        document.getElementById('setUserHint').textContent = (me.displayName || me.username || 'Hesab') + ' · ' + (me.roleLabel || '');
        document.getElementById('navUsers').classList.toggle('hidden', !canManage);
        if (res.data.homeProjectKey) homeProjectKey = res.data.homeProjectKey;
        document.getElementById('scopeProjectKey').value = res.data.currentProjectKey || homeProjectKey;
        document.getElementById('scopeTeam').value = res.data.currentTeam || me.team || 'komplayns';
        document.getElementById('userProjectKey').value = homeProjectKey;
        applyScopeChrome();
        var tokenPanel = document.getElementById('tokenPanel');
        if (tokenPanel) tokenPanel.classList.remove('hidden');
        loadTokenStatus();
        setView(activeView());
        if (canManage) {
            loadUsers();
            loadPeople();
        }
    });
})();
