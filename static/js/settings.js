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
        if (!parts.length) return '?';
        if (parts.length === 1) return parts[0].slice(0, 2).toLocaleUpperCase('az');
        return (parts[0].charAt(0) + parts[parts.length - 1].charAt(0)).toLocaleUpperCase('az');
    }
    function avatarGradient(name) {
        var tones = [
            ['#c4b5fd', '#8b5cf6', '#6d28d9'],
            ['#ddd6fe', '#a78bfa', '#7c3aed'],
            ['#c4b5fd', '#7c3aed', '#5b21b6'],
            ['#a5b4fc', '#818cf8', '#6366f1'],
            ['#ddd6fe', '#8b5cf6', '#5b21b6'],
            ['#e9d5ff', '#c084fc', '#7c3aed']
        ];
        var s = String(name || '');
        var h = 0;
        var i;
        for (i = 0; i < s.length; i++) h = (h * 31 + s.charCodeAt(i)) >>> 0;
        var t = tones[h % tones.length];
        return 'linear-gradient(145deg, ' + t[0] + ' 0%, ' + t[1] + ' 52%, ' + t[2] + ' 100%)';
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
        if (hash === 'chat' && canManage) return 'chat';
        return 'scope';
    }
    function setView(view) {
        if ((view === 'users' || view === 'chat') && !canManage) view = 'scope';
        var isUsers = view === 'users';
        var isChat = view === 'chat';
        var isScope = !isUsers && !isChat;
        document.getElementById('view-scope').classList.toggle('hidden', !isScope);
        document.getElementById('view-users').classList.toggle('hidden', !isUsers);
        var viewChat = document.getElementById('view-chat');
        if (viewChat) viewChat.classList.toggle('hidden', !isChat);
        document.getElementById('navScope').classList.toggle('is-on', isScope);
        var navUsers = document.getElementById('navUsers');
        if (navUsers) navUsers.classList.toggle('is-on', isUsers);
        var navChat = document.getElementById('navChat');
        if (navChat) navChat.classList.toggle('is-on', isChat);
        document.getElementById('setTitle').textContent = isUsers
            ? 'İstifadəçilər'
            : (isChat ? 'AI Done' : 'Layihə və komanda');
        document.getElementById('setSub').textContent = isUsers
            ? 'Hesablar, rollar və hər kəsə verilən access-lər.'
            : (isChat
                ? 'Qurum lüğəti, söhbət keyfiyyəti və AI cavabları.'
                : 'Jira KEY və komanda bu panelin əhatəsini müəyyən edir.');
        if (isUsers && location.hash !== '#users') history.replaceState(null, '', '#users');
        else if (isChat && location.hash !== '#chat') history.replaceState(null, '', '#chat');
        else if (isScope && location.hash && location.hash !== '#scope') history.replaceState(null, '', '#scope');
        if (isChat) {
            loadChatKb();
            loadChatLogs();
        }
    }
    function parseAliasInput(raw) {
        return String(raw || '')
            .split(/[,;\n]+/)
            .map(function (s) { return s.trim(); })
            .filter(Boolean);
    }
    function fillKbForm(canonical, aliases) {
        var c = document.getElementById('kbCanonical');
        var a = document.getElementById('kbAliases');
        if (c) c.value = canonical || '';
        if (a) a.value = (aliases || []).join(', ');
        if (c) try { c.focus(); } catch (e) {}
    }
    function renderKbList(items) {
        var list = document.getElementById('kbList');
        var status = document.getElementById('kbStatus');
        if (!list) return;
        items = items || [];
        if (status) status.textContent = items.length
            ? (items.length + ' qurum · data/chat_kb.json')
            : 'Hələ sabit alias yoxdur — əlavə edin.';
        if (!items.length) {
            list.innerHTML = '<p class="set-chat-empty">Boş lüğət. Tam ad və qısa adları yuxarıda yazın.</p>';
            return;
        }
        list.innerHTML = items.map(function (it) {
            var als = (it.aliases || []).map(function (a) {
                return '<span class="set-kb-chip">' + esc(a) + '</span>';
            }).join('');
            return '<article class="set-kb-item" data-canonical="' + esc(it.canonical || '') + '">'
                + '<div class="set-kb-item-main">'
                + '<strong>' + esc(it.canonical || '') + '</strong>'
                + '<div class="set-kb-chips">' + (als || '<span class="set-note">alias yoxdur</span>') + '</div>'
                + '</div>'
                + '<div class="set-kb-item-actions">'
                + '<button type="button" class="admin-btn admin-btn--ghost set-kb-edit">Redaktə</button>'
                + '<button type="button" class="admin-btn admin-btn--quiet set-kb-del">Sil</button>'
                + '</div>'
                + '</article>';
        }).join('');
    }
    function loadChatKb() {
        showError('kbError', '');
        var ok = document.getElementById('kbOk');
        if (ok) ok.textContent = '';
        return api('/api/chat/kb').then(function (res) {
            if (!res.ok) {
                var err = (res.data && res.data.error) || '';
                if (res.status === 404) err = 'Server köhnə kodla işləyir — app-i yenidən başladın';
                if (res.status === 403) err = err || 'İcazə yoxdur (admin lazımdır)';
                showError('kbError', err || ('Lüğət oxunmadı (' + res.status + ')'));
                renderKbList([]);
                return;
            }
            renderKbList((res.data && res.data.qurumAliases) || []);
        }).catch(function () {
            showError('kbError', 'Serverə qoşulmaq mümkün olmadı');
        });
    }
    function saveChatKb() {
        var canonical = String((document.getElementById('kbCanonical') || {}).value || '').trim();
        var aliases = parseAliasInput((document.getElementById('kbAliases') || {}).value || '');
        showError('kbError', '');
        var ok = document.getElementById('kbOk');
        if (ok) ok.textContent = '';
        if (!canonical) {
            showError('kbError', 'Tam ad yazın (məs. Dövlət Miqrasiya Xidməti), qısa adı aşağıda');
            return;
        }
        api('/api/chat/kb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ canonical: canonical, aliases: aliases })
        }).then(function (res) {
            if (!res.ok) {
                var err = (res.data && res.data.error) || '';
                if (res.status === 404) err = 'Server köhnə kodla işləyir — app-i yenidən başladın';
                if (res.status === 403) err = err || 'İcazə yoxdur (admin lazımdır)';
                showError('kbError', err || ('Saxlanılmadı (' + res.status + ')'));
                return;
            }
            if (ok) ok.textContent = 'Yadda saxlandı';
            fillKbForm('', []);
            renderKbList((res.data && res.data.qurumAliases) || []);
        }).catch(function () {
            showError('kbError', 'Serverə qoşulmaq mümkün olmadı');
        });
    }
    function deleteChatKb(canonical) {
        if (!canonical) return;
        if (!window.confirm('«' + canonical + '» lüğətdən silinsin?')) return;
        showError('kbError', '');
        api('/api/chat/kb', {
            method: 'DELETE',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ canonical: canonical })
        }).then(function (res) {
            if (!res.ok) {
                showError('kbError', (res.data && res.data.error) || 'Silinmədi');
                return;
            }
            renderKbList((res.data && res.data.qurumAliases) || []);
        }).catch(function () {
            showError('kbError', 'Serverə qoşulmaq mümkün olmadı');
        });
    }
    function resolveChatKb() {
        var q = String((document.getElementById('kbResolveQ') || {}).value || '').trim();
        var out = document.getElementById('kbResolveOut');
        if (!out) return;
        if (!q) {
            out.textContent = 'Axtarış yazın';
            return;
        }
        out.textContent = 'Yoxlanılır…';
        api('/api/chat/kb?resolve=' + encodeURIComponent(q)).then(function (res) {
            if (!res.ok) {
                if (res.status === 404) out.textContent = 'Server köhnədir — app-i yenidən başladın';
                else out.textContent = (res.data && res.data.error) || ('Alınmadı (' + res.status + ')');
                return;
            }
            var r = (res.data && res.data.resolve) || {};
            if (r.match) {
                out.innerHTML = 'Tapıldı: <strong>' + esc(r.match) + '</strong>'
                    + (r.suggestions && r.suggestions.length
                        ? ' · digər: ' + r.suggestions.map(esc).join(', ')
                        : '');
            } else {
                out.textContent = 'Uyğunluq yoxdur'
                    + (r.suggestions && r.suggestions.length
                        ? ' · bənzəyənlər: ' + r.suggestions.join(', ')
                        : '');
            }
        }).catch(function () {
            out.textContent = 'Server xətası';
        });
    }
    function kbAction(action, extra, busyLabel) {
        showError('kbError', '');
        var ok = document.getElementById('kbOk');
        if (ok) ok.textContent = busyLabel || 'İşləyir…';
        var body = Object.assign({ action: action }, extra || {});
        return api('/api/chat/kb', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify(body)
        }).then(function (res) {
            if (!res.ok) {
                if (ok) ok.textContent = '';
                showError('kbError', (res.data && res.data.error) || ('Alınmadı (' + res.status + ')'));
                if (res.data && res.data.qurumAliases) renderKbList(res.data.qurumAliases);
                return;
            }
            renderKbList((res.data && res.data.qurumAliases) || []);
            if (ok) {
                if (action === 'seed') ok.textContent = 'Standart qurumlar yükləndi (' + ((res.data && res.data.count) || 0) + ')';
                else if (action === 'enrich') ok.textContent = 'AI tamamladı (' + ((res.data && res.data.enriched) || 0) + ' yeniləmə)';
                else if (action === 'merge_live') ok.textContent = 'Paneldən əlavə olundu (' + ((res.data && res.data.count) || 0) + ')';
                else ok.textContent = 'Hazır';
            }
        }).catch(function () {
            if (ok) ok.textContent = '';
            showError('kbError', 'Serverə qoşulmaq mümkün olmadı');
        });
    }
    function seedChatKb() {
        kbAction('seed', {}, 'Standart siyahı yüklənir…');
    }
    function enrichChatKb() {
        kbAction('enrich', {}, 'AI qısa adları hazırlayır…');
    }
    function readStoredQurumNames() {
        var bags = [];
        function pushParsed(raw) {
            if (!raw) return;
            try {
                var parsed = JSON.parse(raw);
                if (Array.isArray(parsed)) bags.push(parsed);
            } catch (e) {}
        }
        try { pushParsed(localStorage.getItem('aiDoneQurums')); } catch (e1) {}
        try { pushParsed(sessionStorage.getItem('aiDoneQurums')); } catch (e2) {}
        try {
            if (Array.isArray(window.__AI_DONE_QURUMS__)) bags.push(window.__AI_DONE_QURUMS__);
        } catch (e3) {}
        try {
            var snap = window.__AI_DONE_SNAPSHOT__ || (window.opener && window.opener.__AI_DONE_SNAPSHOT__);
            if (snap && Array.isArray(snap.qurums)) {
                bags.push(snap.qurums.map(function (r) { return (r && r.name) || r; }));
            }
        } catch (e4) {}
        try {
            var cat = localStorage.getItem('aiDoneQurumCatalog');
            if (cat) {
                var rows = JSON.parse(cat);
                if (Array.isArray(rows)) {
                    bags.push(rows.map(function (r) { return (r && r.name) || ''; }));
                }
            }
        } catch (e5) {}
        var seen = {};
        var out = [];
        bags.forEach(function (list) {
            (list || []).forEach(function (n) {
                n = String(n || '').trim();
                if (!n || seen[n]) return;
                seen[n] = true;
                out.push(n);
            });
        });
        return out;
    }
    function mergeLiveChatKb() {
        var names = readStoredQurumNames();
        if (!names.length) {
            // Panel keşi yoxdursa standartı yüklə — boş error vermə
            showError('kbError', '');
            var ok = document.getElementById('kbOk');
            if (ok) ok.textContent = 'Panel keşi boşdur — standart qurumlar yüklənir…';
            return kbAction('seed', {}, 'Standart qurumlar yüklənir…').then(function () {
                if (ok) {
                    ok.textContent = 'Standart yükləndi. Live qurumlar üçün paneli açıb məlumat yükləyin, sonra yenidən «Paneldən götür».';
                }
            });
        }
        kbAction('merge_live', { names: names }, 'Paneldən birləşdirilir…');
    }
    function chatFilterQuery() {
        var flag = (document.getElementById('chatLogFlag') || {}).value || '';
        var source = (document.getElementById('chatLogSource') || {}).value || '';
        var q = (document.getElementById('chatLogQ') || {}).value || '';
        var params = new URLSearchParams();
        params.set('limit', '80');
        if (flag) params.set('flag', flag);
        if (source) params.set('source', source);
        if (q.trim()) params.set('q', q.trim());
        return '/api/chat/logs?' + params.toString();
    }
    function renderChatStats(stats) {
        var box = document.getElementById('chatLogStats');
        if (!box) return;
        stats = stats || {};
        var avg = stats.avgDurationMs != null ? (Math.round(stats.avgDurationMs / 100) / 10) + 's' : '—';
        box.innerHTML =
            '<div class="set-chat-stat"><b>' + esc(String(stats.llmRate != null ? stats.llmRate : 0)) + '%</b><span>AI uğur</span></div>'
            + '<div class="set-chat-stat"><b>' + esc(String(stats.errorRate != null ? stats.errorRate : 0)) + '%</b><span>Xəta</span></div>'
            + '<div class="set-chat-stat"><b>' + esc(String(stats.thumbsDown || 0)) + '</b><span>👎 zəif</span></div>'
            + '<div class="set-chat-stat"><b>' + esc(avg) + '</b><span>Orta müddət</span></div>';
        var top = stats.topQuestions || [];
        var existing = document.getElementById('chatLogTop');
        if (existing) existing.remove();
        if (top.length) {
            var p = document.createElement('p');
            p.id = 'chatLogTop';
            p.className = 'set-chat-top';
            p.innerHTML = '<strong>Top suallar:</strong> ' + top.map(function (t) {
                return esc(t.q) + ' (' + esc(String(t.n)) + ')';
            }).join(' · ');
            box.insertAdjacentElement('afterend', p);
        }
    }
    function loadChatLogs() {
        var list = document.getElementById('chatLogList');
        var status = document.getElementById('chatLogStatus');
        if (!list) return;
        showError('chatLogError', '');
        list.innerHTML = '<p class="set-chat-empty">Yüklənir…</p>';
        return api(chatFilterQuery()).then(function (res) {
            if (!res.ok) {
                list.innerHTML = '';
                showError('chatLogError', (res.data && res.data.error) || 'Jurnal oxunmadı');
                return;
            }
            var items = (res.data && res.data.items) || [];
            renderChatStats(res.data.stats || {});
            if (status) {
                status.textContent = (res.data.hasChatLlm
                    ? 'Server AI açarı aktivdir'
                    : 'Server AI açarı yoxdur — .env-də OPENAI_API_KEY yazın')
                    + (res.data.model ? ' · ' + res.data.model : '')
                    + ' · ' + ((res.data.stats && res.data.stats.total) || items.length) + ' qeyd';
            }
            if (!items.length) {
                list.innerHTML = '<p class="set-chat-empty">Bu filterə uyğun söhbət yoxdur.</p>';
                return;
            }
            list.innerHTML = items.map(function (it) {
                var src = String(it.source || '');
                var fb = it.feedback || {};
                var badgeClass = src === 'llm' ? '' : (src === 'error' ? ' is-err' : ' is-local');
                var badge = src === 'llm' ? 'AI' : (src === 'error' ? 'Xəta' : 'Lokal');
                var who = it.displayName || it.username || 'İstifadəçi';
                var when = String(it.ts || '').replace('T', ' ').replace('Z', '');
                var ans = it.answer || it.error || '—';
                var flags = (it.flags || []).filter(function (f) {
                    return f !== 'thumbs_up' && f !== 'thumbs_down';
                });
                var voteBadge = fb.vote === 'down'
                    ? '<span class="set-chat-badge is-down">👎</span>'
                    : (fb.vote === 'up' ? '<span class="set-chat-badge">👍</span>' : '');
                var taughtBadge = (fb.correctAnswer || (it.flags || []).indexOf('taught') >= 0)
                    ? '<span class="set-chat-badge">Öyrədildi</span>'
                    : '';
                var dur = it.durationMs != null ? Math.round(it.durationMs / 100) / 10 + 's' : '';
                return '<article class="set-chat-item" data-id="' + esc(it.id || '') + '">'
                    + '<div class="set-chat-meta">'
                    + '<span class="set-chat-badge' + badgeClass + '">' + esc(badge) + '</span>'
                    + voteBadge
                    + taughtBadge
                    + '<span>' + esc(who) + '</span>'
                    + (when ? '<span>' + esc(when) + '</span>' : '')
                    + (dur ? '<span>' + esc(dur) + '</span>' : '')
                    + (it.intent || it.kind ? '<span>' + esc(it.intent || it.kind) + '</span>' : '')
                    + flags.filter(function (f) { return f !== 'taught'; }).map(function (f) {
                        return '<span class="set-chat-badge is-local">' + esc(f) + '</span>';
                    }).join('')
                    + '</div>'
                    + '<p class="set-chat-q">' + esc(it.question || '') + '</p>'
                    + '<p class="set-chat-a">' + esc(ans) + '</p>'
                    + (fb.reason ? '<p class="set-chat-a"><em>Səbəb: ' + esc(fb.reason) + '</em></p>' : '')
                    + (fb.correctAnswer ? '<p class="set-chat-a"><em>Düzgün: ' + esc(fb.correctAnswer) + '</em></p>' : '')
                    + (it.id ? '<div class="set-chat-actions"><button type="button" class="admin-btn admin-btn--ghost set-chat-replay" data-id="' + esc(it.id) + '">Yenidən işə sal</button></div>' : '')
                    + '</article>';
            }).join('');
        }).catch(function () {
            list.innerHTML = '';
            showError('chatLogError', 'Serverə qoşulmaq mümkün olmadı');
        });
    }
    function replayChat(chatId, btn) {
        if (!chatId) return;
        showError('chatLogError', '');
        var card = btn && btn.closest ? btn.closest('.set-chat-item') : null;
        if (btn) {
            btn.disabled = true;
            btn.textContent = 'İşləyir…';
        }
        api('/api/chat/replay', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ chatId: chatId })
        }).then(function (res) {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Yenidən işə sal';
            }
            if (!res.ok) {
                showError('chatLogError', (res.data && res.data.error) || 'Replay alınmadı');
                return;
            }
            var prev = res.data.previous || '';
            var next = res.data.answer || '';
            if (card) {
                var old = card.querySelector('.set-chat-replay-box');
                if (old) old.remove();
                var box = document.createElement('div');
                box.className = 'set-chat-replay-box';
                box.innerHTML =
                    '<p class="set-chat-replay-label">Köhnə cavab</p>'
                    + '<p class="set-chat-a">' + esc(prev.slice(0, 700)) + '</p>'
                    + '<p class="set-chat-replay-label">Yeni cavab</p>'
                    + '<p class="set-chat-a">' + esc(next.slice(0, 700)) + '</p>';
                card.appendChild(box);
            }
        }).catch(function () {
            if (btn) {
                btn.disabled = false;
                btn.textContent = 'Yenidən işə sal';
            }
            showError('chatLogError', 'Serverə qoşulmaq mümkün olmadı');
        });
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
    function fillNameFromFull(full) {
        var givenEl = document.getElementById('givenName');
        var surEl = document.getElementById('surname');
        if (!givenEl || !surEl) return;
        if ((givenEl.value || '').trim() && (surEl.value || '').trim()) return;
        var parts = String(full || '').trim().split(/\s+/).filter(Boolean);
        if (!parts.length) return;
        if (!(givenEl.value || '').trim()) givenEl.value = parts[0];
        if (!(surEl.value || '').trim() && parts.length > 1) surEl.value = parts.slice(1).join(' ');
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
            fillNameFromFull(person.displayName || '');
            if (person.linkedUserId && person.linkedUserId !== editingId) {
                note.textContent = 'Bu Jira şəxsinin artıq hesabı var (' + (person.linkedUsername || '') + '). Başqasını seçin və ya mövcud hesabı redaktə edin.';
            } else {
                note.textContent = 'Hesab Jira-dakı «' + (person.displayName || '') + '» ilə bağlanacaq.';
            }
        } else {
            setJiraHidden('', '');
            note.textContent = 'Siyahıda yoxdursa ad, soyad, istifadəçi adı və parol yazın.';
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
        document.getElementById('givenName').value = '';
        document.getElementById('surname').value = '';
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
        var given = user.givenName || '';
        var sur = user.surname || '';
        if ((!given || !sur) && user.displayName) {
            var parts = String(user.displayName).trim().split(/\s+/).filter(Boolean);
            if (!given && parts[0]) given = parts[0];
            if (!sur && parts.length > 1) sur = parts.slice(1).join(' ');
        }
        document.getElementById('givenName').value = given;
        document.getElementById('surname').value = sur;
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
            var name = user.greetingName || user.displayName || user.jiraDisplayName || user.username || '';
            var roleText = roleLabel(user);
            var teamText = teamLabel(user);
            var login = user.username && user.username !== name ? (' · ' + user.username) : '';
            row.innerHTML =
                '<span class="admin-avatar" style="background:' + avatarGradient(name) + '" title="' + esc(initials(name)) + '">' + esc(initials(name)) + '</span>' +
                '<div class="admin-person-copy">' +
                '<h3>' + esc(name) + '</h3>' +
                '<div class="admin-meta">' +
                '<span class="admin-badge' + (privileged ? ' is-admin' : '') + '">' + esc(roleText) + '</span>' +
                (teamText ? '<span class="admin-badge">' + esc(teamText) + '</span>' : '') +
                (login ? '<span class="admin-badge">' + esc(user.username) + '</span>' : '') +
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
    var navChatEl = document.getElementById('navChat');
    if (navChatEl) {
        navChatEl.addEventListener('click', function (ev) {
            ev.preventDefault();
            setView('chat');
        });
    }
    var chatRefresh = document.getElementById('chatLogRefresh');
    if (chatRefresh) {
        chatRefresh.addEventListener('click', function () { loadChatLogs(); });
    }
    var kbRefresh = document.getElementById('kbRefresh');
    if (kbRefresh) kbRefresh.addEventListener('click', function () { loadChatKb(); });
    var kbSave = document.getElementById('kbSave');
    if (kbSave) kbSave.addEventListener('click', function () { saveChatKb(); });
    var kbSeed = document.getElementById('kbSeed');
    if (kbSeed) kbSeed.addEventListener('click', function () { seedChatKb(); });
    var kbEnrich = document.getElementById('kbEnrich');
    if (kbEnrich) kbEnrich.addEventListener('click', function () { enrichChatKb(); });
    var kbMergeLive = document.getElementById('kbMergeLive');
    if (kbMergeLive) kbMergeLive.addEventListener('click', function () { mergeLiveChatKb(); });
    var kbResolveBtn = document.getElementById('kbResolveBtn');
    if (kbResolveBtn) kbResolveBtn.addEventListener('click', function () { resolveChatKb(); });
    var kbResolveQ = document.getElementById('kbResolveQ');
    if (kbResolveQ) {
        kbResolveQ.addEventListener('keydown', function (ev) {
            if (ev.key === 'Enter') {
                ev.preventDefault();
                resolveChatKb();
            }
        });
    }
    var kbList = document.getElementById('kbList');
    if (kbList) {
        kbList.addEventListener('click', function (ev) {
            var item = ev.target.closest('.set-kb-item');
            if (!item) return;
            var canonical = item.getAttribute('data-canonical') || '';
            if (ev.target.closest('.set-kb-edit')) {
                var chips = item.querySelectorAll('.set-kb-chip');
                var aliases = [];
                Array.prototype.forEach.call(chips, function (c) { aliases.push(c.textContent || ''); });
                fillKbForm(canonical, aliases);
                return;
            }
            if (ev.target.closest('.set-kb-del')) {
                deleteChatKb(canonical);
            }
        });
    }
    ['chatLogFlag', 'chatLogSource'].forEach(function (id) {
        var el = document.getElementById(id);
        if (el) el.addEventListener('change', function () { loadChatLogs(); });
    });
    var chatQ = document.getElementById('chatLogQ');
    if (chatQ) {
        var chatQTimer = null;
        chatQ.addEventListener('input', function () {
            clearTimeout(chatQTimer);
            chatQTimer = setTimeout(function () { loadChatLogs(); }, 280);
        });
    }
    var chatList = document.getElementById('chatLogList');
    if (chatList) {
        chatList.addEventListener('click', function (ev) {
            var btn = ev.target.closest('.set-chat-replay');
            if (!btn) return;
            replayChat(btn.getAttribute('data-id'), btn);
        });
    }
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
        var givenName = document.getElementById('givenName').value.trim();
        var surname = document.getElementById('surname').value.trim();
        var username = document.getElementById('username').value.trim();
        if (!givenName || !surname) {
            btn.disabled = false;
            showError('formError', 'Ad və soyad yazın');
            return;
        }
        var jiraId = (person && person.accountId) || document.getElementById('jiraAccountId').value || '';
        var jiraName = (person && person.displayName) || document.getElementById('jiraDisplayName').value || '';
        var displayName = (givenName + ' ' + surname).trim();
        var payload = {
            username: username,
            givenName: givenName,
            surname: surname,
            displayName: displayName,
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
        var navChat = document.getElementById('navChat');
        if (navChat) navChat.classList.toggle('hidden', !canManage);
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
