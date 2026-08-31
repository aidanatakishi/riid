import { state } from './state.js';
import { normalizeStr, showToast } from './utils.js';
import { formatDateObj, getBlockReason, getDatedPhaseEntries, getDifficultyField, getIssueFallbackDate, getParentIssue, lowercasePhaseTextAfterDate, parsePhaseEntriesFromText, selectPhasesForReport, getSprintDateRange, getStatusGroup, getQurumName, getTaskStartDate, getTaskDueDate, hasPhaseText, hasValidDifficulty, isDateInReportPeriod, isDueInSelectedWeek, resolveDirection } from './model.js';

let _docxLibPromise = null;

export function loadDocxLib() {
    if (!_docxLibPromise) {
        _docxLibPromise = import('https://esm.sh/docx@8.5.0').catch(function(err) {
            _docxLibPromise = null;
            throw err;
        });
    }
    return _docxLibPromise;
}

var AZ_MONTHS_LOWER = ['yanvar', 'fevral', 'mart', 'aprel', 'may', 'iyun', 'iyul', 'avqust', 'sentyabr', 'oktyabr', 'noyabr', 'dekabr'];
var AZ_MONTHS_FILE = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'Iyun', 'Iyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];

function parseReportIsoDate(iso) {
    if (!iso) return null;
    var p = String(iso).split('-');
    if (p.length < 3) return null;
    var dt = new Date(parseInt(p[0], 10), parseInt(p[1], 10) - 1, parseInt(p[2], 10));
    if (isNaN(dt.getTime())) return null;
    dt.setHours(0, 0, 0, 0);
    return dt;
}

function azYearMark(year) {
    var n = year % 100;
    var d = year % 10;
    if (n === 11 || n === 12 || n === 13) return year + '-cü';
    if (d === 3 || d === 4) return year + '-cü';
    if (d === 6) return year + '-cı';
    if (d === 9 || d === 0) return year + '-cu';
    return year + '-ci';
}

export function getMonthRangeInfo(startIso, endIso) {
    var start = parseReportIsoDate(startIso);
    var end = parseReportIsoDate(endIso);
    if (!start || !end) return null;
    if (start.getFullYear() !== end.getFullYear() || start.getMonth() !== end.getMonth()) return null;
    var lastDay = new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate();
    var days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    var fromFirst = start.getDate() === 1 && end.getDate() >= Math.min(28, lastDay);
    if (!fromFirst && days < 28) return null;
    return {
        year: start.getFullYear(),
        month: start.getMonth(),
        start: start,
        end: end,
        monthName: AZ_MONTHS_LOWER[start.getMonth()],
        fileMonth: AZ_MONTHS_FILE[start.getMonth()]
    };
}

export function updateReportButtonLabel() {
    var el = document.getElementById('reportDownloadLabel');
    if (!el) return;
    var startEl = document.getElementById('startDate');
    var endEl = document.getElementById('endDate');
    var month = getMonthRangeInfo(startEl && startEl.value, endEl && endEl.value);
    el.textContent = month ? 'Aylıq hesabatı yüklə' : 'Hesabatı yüklə';
}

export function isSelectedMonthRange() {
    var startEl = document.getElementById('startDate');
    var endEl = document.getElementById('endDate');
    return !!getMonthRangeInfo(startEl && startEl.value, endEl && endEl.value);
}

export function duePeriodLabel() {
    return isSelectedMonthRange() ? 'Bu ay bitməli' : 'Bu həftə bitməli';
}

function monthlyDirRank(name) {
    var n = normalizeStr(name || '');
    if (n.indexOf('reyestr') !== -1) return 1;
    if (n.indexOf('məqsədəuyğun') !== -1 || n.indexOf('meqseduygun') !== -1) return 2;
    if (n.indexOf('diaqnostika') !== -1 || n.indexOf('rəqəmsallaşma') !== -1 || n.indexOf('reqemsallasma') !== -1) return 3;
    if (n.indexOf('elektron xidmət') !== -1 || n.indexOf('elektron xidmet') !== -1) return 5;
    if ((n.indexOf('ehtiyat') !== -1 || n.indexOf('sistem') !== -1) && (n.indexOf('qiymət') !== -1 || n.indexOf('qiymet') !== -1)) return 4;
    if (n.indexOf('inteqras') !== -1 || n.indexOf('məlumat hədd') !== -1 || n.indexOf('melumat hedd') !== -1 || n.indexOf('digital') !== -1) return 6;
    return 80;
}

function monthlySectionTitle(dirName) {
    var name = (dirName || 'Digər istiqamətlər').trim();
    if (/üzrə\s*:?\s*$/i.test(name) || /uzre\s*:?\s*$/i.test(normalizeStr(name))) {
        return name.replace(/\s*:?\s*$/, '') + ':';
    }
    return name + ' üzrə:';
}

function monthlyIntroForDirection(dirName, yearMark, monthName) {
    var n = normalizeStr(dirName || '');
    var period = yearMark + ' ilin ' + monthName + ' ayı';
    if (n.indexOf('reyestr') !== -1) {
        return '“Dövlət informasiya ehtiyatlarının, sistemlərinin və elektron xidmətlərin vahid reyestri”nin (bundan sonra - Reyestr) “İnformasiya ehtiyat və sistemləri reyestri” modulu vasitəsilə ' + period + ' ərzində aşağıdakı sistemlər qeydiyyata alınmışdır:';
    }
    if (n.indexOf('məqsədəuyğun') !== -1 || n.indexOf('meqseduygun') !== -1) {
        return 'Qurumların informasiya sistemləri və ehtiyatlarına, habelə elektron xidmətlərinə onların texniki və səmərəliliyi baxımından məqsədəuyğunluğuna dair rəyin verilməsi üzrə:';
    }
    if (n.indexOf('diaqnostika') !== -1 || n.indexOf('rəqəmsallaşma') !== -1 || n.indexOf('reqemsallasma') !== -1) {
        return 'Qurumlarda rəqəmsallaşma səviyyəsinin diaqnostikasının aparılması məqsədilə aşağıdakı tədbirlər həyata keçirilmişdir:';
    }
    if (n.indexOf('elektron xidmət') !== -1 || n.indexOf('elektron xidmet') !== -1) {
        return 'Elektron xidmətlərin qiymətləndirilməsi məqsədilə aşağıdakı tədbirlər həyata keçirilmişdir:';
    }
    if ((n.indexOf('ehtiyat') !== -1 || n.indexOf('sistem') !== -1) && (n.indexOf('qiymət') !== -1 || n.indexOf('qiymet') !== -1)) {
        return 'İnformasiya ehtiyat və sistemlərinin qiymətləndirilməsi üzrə aşağıdakı işlər görülmüşdür:';
    }
    if (n.indexOf('inteqras') !== -1 || n.indexOf('məlumat hədd') !== -1 || n.indexOf('melumat hedd') !== -1 || n.indexOf('digital') !== -1) {
        return 'Məlumat hədlərinin “Rəqəmsal Məlumat Mübadiləsi” (“Digital Bridge”) altsistemi üzərindən inteqrasiyası ilə bağlı aşağıdakı işlər görülmüşdür:';
    }
    return period + ' ərzində bu istiqamət üzrə aşağıdakı işlər görülmüşdür:';
}

function isReyestrDirection(dirName) {
    return normalizeStr(dirName || '').indexOf('reyestr') !== -1;
}

function isMaqsadDirection(dirName) {
    var n = normalizeStr(dirName || '');
    return n.indexOf('məqsədəuyğun') !== -1 || n.indexOf('meqseduygun') !== -1;
}

export async function exportTasksToWord(title) {
    var docxLib;
    try {
        docxLib = await loadDocxLib();
    } catch (err) {
        console.error(err);
        showToast('DOCX kitabxanası yüklənmədi. İnternet bağlantısını yoxlayın.', 'error');
        return;
    }
    var { Document, Packer, Paragraph, TextRun, Table, TableRow, TableCell,
          HeadingLevel, AlignmentType, WidthType, ShadingType, BorderStyle, VerticalAlign,
          Header, Footer, PageNumber } = docxLib;

    var COL_INK = '1A1A1A';
    var COL_BODY = '2F2F2F';
    var COL_MUTED = '6A6A6A';
    var COL_LINE = 'D0D0D0';
    var COL_LINE_SOFT = 'E4E4E4';
    var FILL_SOFT = 'F6F6F6';
    var FILL_ROW = 'FAFAFA';
    var REPORT_FONT = 'Arial';
    var FONT_TITLE = 32;
    var FONT_H1 = 24;
    var FONT_SIZE = 24;
    var FONT_SMALL = 24;
    var FONT_PHASE = 24;

    var noBorder = { style: BorderStyle.NONE, size: 0, color: 'FFFFFF' };
    var hairBorder = { style: BorderStyle.SINGLE, size: 4, color: COL_LINE_SOFT }; 

    var dateStr = new Date().toLocaleDateString('az-AZ');

    var startDate = document.getElementById('startDate').value;
    var endDate = document.getElementById('endDate').value;
    var sprintVal = document.getElementById('sprintFilter').value;
    var periodText = '';
    var periodStart = null, periodEnd = null;
    if (startDate || endDate) {
        if (startDate) {
            var sP = startDate.split('-');
            periodStart = new Date(sP[0], sP[1] - 1, sP[2]);
            periodStart.setHours(0, 0, 0, 0);
        }
        if (endDate) {
            var eP = endDate.split('-');
            periodEnd = new Date(eP[0], eP[1] - 1, eP[2]);
            periodEnd.setHours(23, 59, 59, 999);
        }
        if (startDate && endDate) periodText = startDate + ' - ' + endDate;
        else if (startDate) periodText = startDate + ' tarixindən etibarən';
        else periodText = endDate + ' tarixinə qədər';
    } else if (sprintVal && sprintVal !== 'all') {
        var sprintRange = getSprintDateRange(sprintVal);
        if (sprintRange) {
            periodStart = sprintRange.start;
            periodEnd = sprintRange.end;
            if (periodStart) periodStart.setHours(0, 0, 0, 0);
            if (periodEnd) periodEnd.setHours(23, 59, 59, 999);
            periodText = sprintRange.start.toLocaleDateString('az-AZ') + ' - ' + sprintRange.end.toLocaleDateString('az-AZ');
        } else periodText = sprintVal.replace(/sprint/i, '').trim();
    } else periodText = 'Bütün dövr';

    function groupByDirection(tasks) {
        var groups = {};
        tasks.forEach(function(t) {
            var dir = resolveDirection(t);
            var dirName = dir ? (dir.fields.summary || 'DİGƏR İSTİQAMƏTLƏR').trim() : 'DİGƏR İSTİQAMƏTLƏR';
            if (!groups[dirName]) groups[dirName] = [];
            groups[dirName].push(t);
        });
        var sortedGroups = {};
        Object.keys(groups).sort().forEach(function(k) {
            sortedGroups[k] = groups[k];
        });
        return sortedGroups;
    }

    // Hesabat üçün vahidləri təyin edirik (Ana taskları çıxardırıq)
    var reportUnits = [];
    state.filteredTasks.forEach(function(t) {
        var st = normalizeStr(t.fields.status.name);
        var isPaused = st.includes('dayandır') || st.includes('dayandir') || st.includes('müvəqqəti') || st.includes('muveqqeti');
        if (isPaused) return;

        var hasChildren = false;
        var subtasks = t.fields.subtasks || [];
        if (subtasks.length > 0) hasChildren = true;

        if (!hasChildren && t.fields.issuelinks && t.fields.issuelinks.length > 0) {
            for (var i = 0; i < t.fields.issuelinks.length; i++) {
                var link = t.fields.issuelinks[i];
                var linkedIssue = link.outwardIssue || link.inwardIssue;
                if (linkedIssue && linkedIssue.fields && linkedIssue.fields.issuetype) {
                    var linkedType = normalizeStr(linkedIssue.fields.issuetype.name);
                    if (linkedType.includes('alt') || linkedType.includes('sub')) {
                        hasChildren = true;
                        break;
                    }
                }
            }
        }

        if (!hasChildren) {
            reportUnits.push(t);
        }
    });

    function isSubtaskType(t) {
        if (!t || !t.fields || !t.fields.issuetype) return false;
        var n = normalizeStr(t.fields.issuetype.name);
        return n.includes('alt') || n.includes('sub');
    }

    function isPausedTask(t) {
        if (!t || !t.fields || !t.fields.status) return false;
        var st = normalizeStr(t.fields.status.name);
        return st.includes('dayandır') || st.includes('dayandir') || st.includes('müvəqqəti') || st.includes('muveqqeti');
    }

    function resolveIssue(issue) {
        if (!issue || !issue.key) return issue;
        if (state.issueIndex[issue.key]) return state.issueIndex[issue.key];
        var found = state.allTasks.find(function(at) { return at.key === issue.key; });
        if (found) {
            state.issueIndex[found.key] = found;
            return found;
        }
        return issue;
    }

    function collectChildIssues(t) {
        var children = [];
        var seen = {};
        function addChild(issue) {
            if (!issue || !issue.key || seen[issue.key] || (t && issue.key === t.key)) return;
            var full = resolveIssue(issue);
            if (isPausedTask(full)) return;
            seen[issue.key] = true;
            children.push(full);
        }
        if (!t || !t.fields) return children;
        (t.fields.subtasks || []).forEach(addChild);
        (t.fields.issuelinks || []).forEach(function(link) {
            var linked = link.outwardIssue || link.inwardIssue;
            if (linked && isSubtaskType(linked)) addChild(linked);
        });
        state.allTasks.forEach(function(issue) {
            if (!isSubtaskType(issue)) return;
            var parent = getParentIssue(issue);
            if (parent && parent.key === t.key) addChild(issue);
        });
        return children;
    }

    function phaseIssuesForGroup(t, childIssues, isOwnDone, restrictToPeriod, filterFn) {
        var issues = [];
        if (t) issues.push(t);
        (childIssues || []).forEach(function(subIssue) {
            if (restrictToPeriod && !isOwnDone && !issueMatches(subIssue, filterFn)) return;
            issues.push(subIssue);
        });
        return issues;
    }

    function uniquePhaseEntries(entries) {
        var byText = {};
        (entries || []).forEach(function(e) {
            if (!e || !e.text) return;
            var key = normalizeStr(String(e.text).replace(/^\d{1,2}[./]\d{1,2}[./]\d{4}(?:\s*tarixində)?\s*/i, '').replace(/[.]+$/, ''));
            if (!key) return;
            var prev = byText[key];
            if (!prev) {
                byText[key] = e;
                return;
            }
            var prevTime = prev.date ? prev.date.getTime() : 0;
            var nextTime = e.date ? e.date.getTime() : 0;
            if (nextTime >= prevTime) byText[key] = e;
        });
        return Object.keys(byText).map(function(k) { return byText[k]; });
    }

    function groupPhaseEntries(t, issues, periodStart, periodEnd, restrictToPeriod) {
        var allDated = [];
        (issues || []).forEach(function(issue) {
            allDated = allDated.concat(getDatedPhaseEntries(issue));
        });
        if (!restrictToPeriod) {
            (issues || []).forEach(function(subIssue) {
                if (!subIssue || subIssue.key === t.key) return;
                if (hasPhaseText(subIssue)) return;
                var name = (subIssue.fields && subIssue.fields.summary) ? subIssue.fields.summary : subIssue.key;
                if (!name) return;
                var fallback = getIssueFallbackDate(subIssue);
                var fromText = parsePhaseEntriesFromText(name, fallback);
                if (fromText.length > 0) {
                    allDated = allDated.concat(fromText);
                    return;
                }
                if (fallback) allDated.push({ date: fallback, text: name });
            });
        }
        return selectPhasesForReport(uniquePhaseEntries(allDated), periodStart, periodEnd);
    }

    function formatEntryLine(entry) {
        if (!entry) return '';
        var body = (entry.text || '').trim();
        if (!body) return '';
        var alreadyDated = /^\d{1,2}[./]\d{1,2}[./]\d{4}/.test(body);
        var text;
        if (alreadyDated) {
            text = body.replace(/(tarixində\s+)([\s\S]+)/i, function(_, prefix, rest) {
                return prefix + lowercasePhaseTextAfterDate(rest);
            });
        } else if (!entry.date) {
            text = body;
        } else {
            text = formatDateObj(entry.date) + ' tarixində ' + lowercasePhaseTextAfterDate(body);
        }
        if (text && !text.endsWith('.')) text += '.';
        return text;
    }

    function appendEntryLines(childLines, entries) {
        var seen = {};
        (childLines || []).forEach(function(line) { seen[normalizeStr(line)] = true; });
        (entries || []).forEach(function(entry) {
            var line = formatEntryLine(entry);
            if (!line) return;
            var key = normalizeStr(line);
            if (!key || seen[key]) return;
            seen[key] = true;
            childLines.push(line);
        });
    }

    function appendProblemReason(childLines, issue) {
        if (!issue || !issue.fields || !issue.fields.status) return;
        var g = getStatusGroup(issue.fields.status.name);
        if (g === 'blocked') {
            var reason = getBlockReason(issue);
            if (reason) childLines.push('Bloklanma səbəbi: ' + reason + '.');
            return;
        }
        if (hasValidDifficulty(issue)) {
            childLines.push('Qarşılanan çətinlik: ' + getDifficultyField(issue) + '.');
        }
    }

    function issueMatches(t, filterFn) {
        if (!t || !t.fields || !t.fields.status) return false;
        if (isPausedTask(t)) return false;
        return filterFn(t);
    }

    function getPrintTasks(filterFn, sourceTasks) {
        var printList = [];
        var seen = {};
        function addParent(t) {
            if (!t || !t.key || seen[t.key] || isPausedTask(t)) return;
            if (isSubtaskType(t)) return;
            seen[t.key] = true;
            printList.push(t);
        }
        (sourceTasks || state.filteredTasks).forEach(function(t) {
            if (isPausedTask(t)) return;
            if (isSubtaskType(t)) {
                if (issueMatches(t, filterFn)) addParent(getParentIssue(t));
                return;
            }
            if (issueMatches(t, filterFn)) {
                addParent(t);
                return;
            }
            var kids = collectChildIssues(t);
            for (var i = 0; i < kids.length; i++) {
                if (issueMatches(kids[i], filterFn)) {
                    addParent(t);
                    return;
                }
            }
        });
        return printList;
    }

    function buildSection(tasks, isProblemSection, periodStart, periodEnd, filterFn, restrictToPeriod) {
        var nodes = [];
        var groups = groupByDirection(tasks);
        var dirNames = Object.keys(groups);
        dirNames.forEach(function(dirName) {
            var dirNodes = [];
            groups[dirName].forEach(function(t) {
                var taskText = t.fields.summary;
                var isOwnDone = issueMatches(t, filterFn);
                var childIssues = collectChildIssues(t);

                if (isProblemSection) {
                    var g = getStatusGroup(t.fields.status.name);
                    var diff = getDifficultyField(t);
                    var blockReason = getBlockReason(t);
                    if (g === 'rejected') taskText += ' — imtina';
                    else if (g === 'blocked') {
                        taskText += ' — bloklanıb';
                        if (blockReason) taskText += ' — bloklanma səbəbi: ' + blockReason;
                    } else if (hasValidDifficulty(t)) {
                        taskText += ' — qarşılanan çətinlik: ' + diff;
                    }
                }

                var childLines = [];

                if (isProblemSection) appendProblemReason(childLines, t);
                var groupIssues = phaseIssuesForGroup(t, childIssues, isOwnDone, restrictToPeriod, filterFn);
                appendEntryLines(childLines, groupPhaseEntries(t, groupIssues, periodStart, periodEnd, restrictToPeriod));
                if (!restrictToPeriod) {
                    groupIssues.forEach(function(subIssue) {
                        if (subIssue.key === t.key) return;
                        if (hasPhaseText(subIssue)) return;
                        if (getIssueFallbackDate(subIssue)) return;
                        if (isProblemSection && issueMatches(subIssue, filterFn)) appendProblemReason(childLines, subIssue);
                        var name = (subIssue.fields && subIssue.fields.summary) ? subIssue.fields.summary : subIssue.key;
                        if (name) childLines.push(name.endsWith('.') ? name : name + '.');
                    });
                }
                childIssues.forEach(function(subIssue) {
                    if (restrictToPeriod && !isOwnDone && !issueMatches(subIssue, filterFn)) return;
                    if (isProblemSection && issueMatches(subIssue, filterFn) && hasPhaseText(subIssue)) {
                        appendProblemReason(childLines, subIssue);
                    }
                });

                if (childLines.length === 0) {
                    if (restrictToPeriod || !isOwnDone) return;
                }

                dirNodes.push(new Paragraph({
                    spacing: { before: 80, after: 40 },
                    children: [
                        new TextRun({ text: '–  ', font: REPORT_FONT, size: FONT_SIZE, color: COL_MUTED }),
                        new TextRun({ text: taskText, bold: true, font: REPORT_FONT, size: FONT_SIZE, color: COL_INK })
                    ]
                }));

                if (childLines.length > 0) {
                    childLines.forEach(function(line, lineIdx) {
                        dirNodes.push(new Paragraph({
                            spacing: { after: lineIdx === childLines.length - 1 ? 140 : 40, line: 276 },
                            indent: { left: 400 },
                            children: [
                                new TextRun({ text: line, font: REPORT_FONT, size: FONT_PHASE, color: COL_MUTED })
                            ]
                        }));
                    });
                } else {
                    dirNodes.push(new Paragraph({ spacing: { after: 80 }, children: [] }));
                }
            });
            if (dirNodes.length === 0) return;
            nodes.push(new Paragraph({
                spacing: { before: 200, after: 80 },
                shading: { fill: FILL_SOFT, type: ShadingType.CLEAR, color: 'auto' },
                border: {
                    left: { style: BorderStyle.SINGLE, size: 16, color: COL_INK, space: 8 }
                },
                indent: { left: 80 },
                children: [new TextRun({ text: dirName.toLocaleUpperCase('az'), bold: true, font: REPORT_FONT, size: FONT_SMALL, color: COL_INK })]
            }));
            nodes.push.apply(nodes, dirNodes);
        });
        return nodes;
    }

    function monthlyFileName(info) {
        return 'IRIA_Ayliq_Hesabat_' + info.fileMonth + '_' + info.year + '.docx';
    }

    async function downloadGeneratedDoc(doc, filename, toastMsg) {
        try {
            var blob = await Packer.toBlob(doc);
            var url = URL.createObjectURL(blob);
            var fileDownload = document.createElement('a');
            document.body.appendChild(fileDownload);
            fileDownload.href = url;
            fileDownload.download = filename;
            fileDownload.click();
            document.body.removeChild(fileDownload);
            URL.revokeObjectURL(url);
            showToast(toastMsg, 'success');
        } catch (err) {
            console.error(err);
            showToast('Hesabat yaradılarkən xəta baş verdi: ' + err.message, 'error');
        }
    }

    function matchesReportSideFilters(t) {
        if (!t || !t.fields) return false;
        if (state.currentDirectionFilter) {
            var dir = resolveDirection(t);
            if (!dir || dir.key !== state.currentDirectionFilter) return false;
        }
        if (state.currentQurumFilter) {
            var q = getQurumName(t) || 'Təyin edilməyib';
            if (q !== state.currentQurumFilter) return false;
        }
        if (state.currentAssigneeFilter) {
            if (!t.fields.assignee || t.fields.assignee.displayName !== state.currentAssigneeFilter) return false;
        }
        return true;
    }

    function taskHasMonthActivity(t, start, end) {
        if (!t || !t.fields || isPausedTask(t)) return false;
        var startD = getTaskStartDate(t);
        if (startD && isDateInReportPeriod(startD, start, end)) return true;
        var dueRaw = t.fields['customfield_10807'] || t.fields.duedate;
        if (dueRaw) {
            var due = parseReportIsoDate(String(dueRaw).split('T')[0]);
            if (due && isDateInReportPeriod(due, start, end)) return true;
        }
        var entries = getDatedPhaseEntries(t);
        for (var i = 0; i < entries.length; i++) {
            if (entries[i].date && isDateInReportPeriod(entries[i].date, start, end)) return true;
        }
        return false;
    }

    function collectMonthlySource(info) {
        var seen = {};
        var out = [];
        function add(t) {
            if (!t || !t.key || seen[t.key] || isPausedTask(t)) return;
            if (!matchesReportSideFilters(t)) return;
            seen[t.key] = true;
            out.push(t);
        }
        (state.filteredTasks || []).forEach(add);
        (state.allTasks || []).forEach(function(t) {
            if (taskHasMonthActivity(t, info.start, info.end)) add(t);
        });
        return out;
    }

    function issueMonthPhaseEntries(t, info) {
        if (!t || !info) return [];
        var inPeriod = uniquePhaseEntries(getDatedPhaseEntries(t)).filter(function(entry) {
            return entry && entry.date && isDateInReportPeriod(entry.date, info.start, info.end);
        });
        inPeriod.sort(function(a, b) { return a.date - b.date; });
        return inPeriod;
    }

    function isSkippedMonthlyTask(t) {
        if (!t || isPausedTask(t)) return true;
        if (!t.fields || !t.fields.status) return false;
        var g = getStatusGroup(t.fields.status.name);
        return g === 'rejected' || g === 'paused';
    }

    function taskSummary(t) {
        return (t && t.fields && t.fields.summary) ? String(t.fields.summary).trim() : '';
    }

    function collectMonthlyWorkUnits(dirTasks, info) {
        var seen = {};
        var units = [];
        function walk(t) {
            if (!t || !t.key || seen[t.key]) return;
            seen[t.key] = true;
            if (isSkippedMonthlyTask(t)) return;
            var kids = collectChildIssues(t).filter(function(child) {
                return child && !isSkippedMonthlyTask(child);
            });
            if (kids.length > 0) {
                var before = units.length;
                kids.forEach(walk);
                if (units.length > before) return;
            }
            var entries = issueMonthPhaseEntries(t, info);
            if (entries.length === 0) return;
            units.push({ task: t, entries: entries });
        }
        (dirTasks || []).forEach(walk);
        units.sort(function(a, b) {
            var da = a.entries[0] && a.entries[0].date ? a.entries[0].date.getTime() : 0;
            var db = b.entries[0] && b.entries[0].date ? b.entries[0].date.getTime() : 0;
            if (da !== db) return da - db;
            return taskSummary(a.task).localeCompare(taskSummary(b.task), 'az');
        });
        return units;
    }

    function monthlyTaskNameParagraph(text, fontName) {
        return new Paragraph({
            spacing: { before: 80, after: 40 },
            children: [
                new TextRun({ text: '–  ', font: fontName, size: 22, color: COL_MUTED }),
                new TextRun({ text: text, bold: true, font: fontName, size: 22, color: COL_INK })
            ]
        });
    }

    function monthlyPhaseParagraph(text, fontName, isLast) {
        return new Paragraph({
            spacing: { after: isLast ? 140 : 40, line: 276 },
            indent: { left: 400 },
            children: [new TextRun({ text: text, font: fontName, size: 22, color: COL_MUTED })]
        });
    }

    function appendMonthlyTaskEntries(monthChildren, units, fontName, skipFn) {
        (units || []).forEach(function(row) {
            var t = row && row.task;
            if (!t || (skipFn && skipFn(t))) return;
            var name = taskSummary(t);
            if (!name) return;
            var lines = [];
            appendEntryLines(lines, row.entries);
            if (lines.length === 0) return;
            monthChildren.push(monthlyTaskNameParagraph(name, fontName));
            lines.forEach(function(line, idx) {
                monthChildren.push(monthlyPhaseParagraph(line, fontName, idx === lines.length - 1));
            });
        });
    }

    function fieldDay(t, fieldName) {
        var raw = t && t.fields && t.fields[fieldName];
        if (!raw) return null;
        return parseReportIsoDate(String(raw).split('T')[0]);
    }

    function isReyestrProcessTask(t) {
        var s = normalizeStr(taskSummary(t));
        if (!s) return false;
        var hasReyestr = s.indexOf('reyestr') !== -1;
        var hasMaqsad = s.indexOf('məqsədəuyğun') !== -1 || s.indexOf('meqseduygun') !== -1;
        var hasProcess = s.indexOf('proses') !== -1 || s.indexOf('təşkil') !== -1 || s.indexOf('teskil') !== -1;
        return hasReyestr && hasMaqsad && hasProcess;
    }

    function isReyestrSupportTask(t) {
        if (!t) return true;
        if (isReyestrProcessTask(t)) return true;
        var s = normalizeStr(taskSummary(t));
        if (!s) return true;
        return s.indexOf('tədbirlər plan') !== -1
            || s.indexOf('tedbirler plan') !== -1
            || s.indexOf('gündəlik görüş') !== -1
            || s.indexOf('gundelik gorus') !== -1;
    }

    function isSystemRegistrationTask(t) {
        if (!t || isReyestrSupportTask(t)) return false;
        var s = normalizeStr(taskSummary(t));
        if (!s) return false;
        return s.indexOf('qeydiyyat') !== -1
            || s.indexOf('informasiya sistem') !== -1
            || s.indexOf('informasiya ehtiyat') !== -1
            || s.indexOf('sistem') !== -1;
    }

    function wasRegisteredInMonth(t, info) {
        if (!t || !info || isPausedTask(t) || isReyestrSupportTask(t)) return false;
        var statusName = t.fields && t.fields.status ? t.fields.status.name : '';
        var g = getStatusGroup(statusName);
        if (g === 'rejected' || g === 'paused') return false;
        var resolved = fieldDay(t, 'resolutiondate');
        if (resolved && isDateInReportPeriod(resolved, info.start, info.end)) return true;
        if (g !== 'done') return false;
        if (taskHasMonthActivity(t, info.start, info.end)) return true;
        var created = fieldDay(t, 'created');
        if (created && isDateInReportPeriod(created, info.start, info.end)) return true;
        var due = getTaskDueDate(t);
        return !!(due && isDateInReportPeriod(due, info.start, info.end));
    }

    function cleanSystemName(raw) {
        var name = String(raw || '').trim();
        name = name.replace(/\s*qeydiyyatı\s*$/i, '').replace(/\s*qeydiyyati\s*$/i, '').trim();
        return name;
    }

    function formatRegistryItem(text, isLast) {
        var body = String(text || '').replace(/[;.,]+\s*$/, '').trim();
        if (!body) return '';
        return body + (isLast ? '.' : ';');
    }

    function bodyParagraph(text, fontName) {
        return new Paragraph({
            spacing: { after: 160, line: 276 },
            children: [new TextRun({ text: text, font: fontName, size: 22, color: COL_BODY })]
        });
    }

    function collectDirectionTasks(dirName, parentList, monthSource) {
        var out = [];
        var seen = {};
        function add(t) {
            if (!t || !t.key || seen[t.key] || isPausedTask(t)) return;
            var dir = resolveDirection(t);
            var name = dir ? (dir.fields.summary || '').trim() : 'DİGƏR İSTİQAMƏTLƏR';
            if (name !== dirName) return;
            seen[t.key] = true;
            out.push(t);
        }
        (parentList || []).forEach(add);
        (monthSource || []).forEach(add);
        (state.allTasks || []).forEach(function(t) {
            var dir = resolveDirection(t);
            var name = dir ? (dir.fields.summary || '').trim() : '';
            if (name === dirName) add(t);
        });
        return out;
    }

    function collectRegisteredSystems(dirTasks, info) {
        var names = [];
        var seen = {};
        var visited = {};
        var candidates = [];
        function addName(raw) {
            var name = cleanSystemName(raw);
            if (!name) return;
            var key = normalizeStr(name);
            if (!key || seen[key]) return;
            seen[key] = true;
            names.push(name);
        }
        function collectAll(t) {
            if (!t || !t.key || visited[t.key]) return;
            visited[t.key] = true;
            if (isReyestrProcessTask(t)) return;
            candidates.push(t);
            collectChildIssues(t).forEach(collectAll);
        }
        (dirTasks || []).forEach(collectAll);
        var monthSet = {};
        candidates.forEach(function(t) {
            if (isSystemRegistrationTask(t) && wasRegisteredInMonth(t, info)) monthSet[t.key] = t;
        });
        Object.keys(monthSet).forEach(function(key) {
            var t = monthSet[key];
            var hasMonthChild = collectChildIssues(t).some(function(child) {
                return child && child.key && monthSet[child.key];
            });
            if (hasMonthChild) return;
            addName(taskSummary(t));
        });
        return names;
    }

    function bulletParagraph(text, fontName) {
        return new Paragraph({
            spacing: { after: 120, line: 276 },
            indent: { left: 280, hanging: 200 },
            children: [
                new TextRun({ text: '•  ' + text, font: fontName, size: 22, color: COL_INK })
            ]
        });
    }

    function buildMonthlyDocument(info) {
        var MONTH_FONT = 'Times New Roman';
        var yearMark = azYearMark(info.year);
        var titleLine = yearMark + ' ilin ' + info.monthName + ' ayı üzrə fəaliyyətinə dair hesabat';
        var monthSource = collectMonthlySource(info);
        var allParents = getPrintTasks(function() { return true; }, monthSource);
        var seenParent = {};
        var uniqueParents = [];
        allParents.forEach(function(t) {
            if (!t || !t.key || seenParent[t.key]) return;
            seenParent[t.key] = true;
            uniqueParents.push(t);
        });
        var doneParents = [];
        var ongoingParents = [];
        uniqueParents.forEach(function(t) {
            if (getStatusGroup(t.fields.status.name) === 'done') doneParents.push(t);
            else ongoingParents.push(t);
        });
        var doneGroups = groupByDirection(doneParents);
        var ongoingGroups = groupByDirection(ongoingParents);
        var dirSet = {};
        Object.keys(doneGroups).forEach(function(k) { dirSet[k] = true; });
        Object.keys(ongoingGroups).forEach(function(k) { dirSet[k] = true; });
        (state.allTasks || []).forEach(function(t) {
            var dir = resolveDirection(t);
            var name = dir ? (dir.fields.summary || '').trim() : '';
            if (name && (isReyestrDirection(name) || isMaqsadDirection(name))) dirSet[name] = true;
        });
        (monthSource || []).forEach(function(t) {
            if (isSkippedMonthlyTask(t)) return;
            var dir = resolveDirection(t);
            var name = dir ? (dir.fields.summary || 'DİGƏR İSTİQAMƏTLƏR').trim() : 'DİGƏR İSTİQAMƏTLƏR';
            if (name) dirSet[name] = true;
        });
        var dirNames = Object.keys(dirSet).sort(function(a, b) {
            var ra = monthlyDirRank(a);
            var rb = monthlyDirRank(b);
            if (ra !== rb) return ra - rb;
            return a.localeCompare(b, 'az');
        });

        var monthChildren = [];
        var TEDBIRLER_PLANI = 'Reyestrin inkişafı məqsədilə hazırlanmış Tədbirlər Planının icra vəziyyətinin müzakirəsi məqsədilə aidiyyəti əməkdaşlarla gündəlik görüşlər keçirilmiş və aşağıdakı bölmələr üzrə yoxlamalar aparılmışdır:';

        monthChildren.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: 'Qiymətləndirmə və komplayens şöbəsinin', bold: true, font: MONTH_FONT, size: 28, color: COL_INK })]
        }));
        monthChildren.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 360 },
            border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COL_INK, space: 12 } },
            children: [new TextRun({ text: titleLine, bold: true, font: MONTH_FONT, size: 28, color: COL_INK })]
        }));

        if (dirNames.length === 0) {
            monthChildren.push(new Paragraph({
                spacing: { before: 200 },
                children: [new TextRun({ text: yearMark + ' ilin ' + info.monthName + ' ayı üzrə qeydə alınmış fəaliyyət tapılmadı.', font: MONTH_FONT, size: 22, color: COL_BODY })]
            }));
        }

        dirNames.forEach(function(dirName) {
            monthChildren.push(new Paragraph({
                spacing: { before: 280, after: 120 },
                children: [new TextRun({ text: monthlySectionTitle(dirName), bold: true, font: MONTH_FONT, size: 24, color: COL_INK })]
            }));
            var intro = monthlyIntroForDirection(dirName, yearMark, info.monthName);
            if (intro) monthChildren.push(bodyParagraph(intro, MONTH_FONT));
            var dirTasks = collectDirectionTasks(dirName, uniqueParents, monthSource);
            var units = collectMonthlyWorkUnits(dirTasks, info);
            if (isReyestrDirection(dirName)) {
                var systems = collectRegisteredSystems(dirTasks, info);
                systems.forEach(function(name, idx) {
                    var line = formatRegistryItem(name, idx === systems.length - 1);
                    if (line) monthChildren.push(bulletParagraph(line, MONTH_FONT));
                });
                monthChildren.push(bodyParagraph(TEDBIRLER_PLANI, MONTH_FONT));
                appendMonthlyTaskEntries(monthChildren, units, MONTH_FONT, function(t) {
                    return isSystemRegistrationTask(t) && wasRegisteredInMonth(t, info);
                });
                return;
            }
            appendMonthlyTaskEntries(monthChildren, units, MONTH_FONT);
        });

        return new Document({
            sections: [{
                properties: {
                    titlePage: true,
                    page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } }
                },
                headers: {
                    first: new Header({ children: [new Paragraph({ children: [] })] }),
                    default: new Header({
                        children: [
                            new Paragraph({
                                border: { bottom: { style: BorderStyle.SINGLE, size: 6, color: COL_LINE, space: 6 } },
                                spacing: { after: 80 },
                                children: [new TextRun({ text: 'HESABAT – ' + info.year, font: MONTH_FONT, size: 20, color: COL_MUTED })]
                            })
                        ]
                    })
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                alignment: AlignmentType.RIGHT,
                                border: { top: { style: BorderStyle.SINGLE, size: 6, color: COL_LINE, space: 8 } },
                                spacing: { before: 60 },
                                children: [
                                    new TextRun({ children: [PageNumber.CURRENT], font: MONTH_FONT, size: 20, color: COL_MUTED })
                                ]
                            })
                        ]
                    })
                },
                children: monthChildren
            }],
            styles: {
                default: {
                    document: { run: { color: COL_BODY, font: MONTH_FONT, size: 22 } }
                }
            }
        });
    }

    var monthInfo = getMonthRangeInfo(startDate, endDate);
    if (monthInfo) {
        await downloadGeneratedDoc(buildMonthlyDocument(monthInfo), monthlyFileName(monthInfo), 'Aylıq hesabat (.docx) uğurla yükləndi!');
        return;
    }

    function hasDiffDash(t) {
        var g = getStatusGroup(t.fields.status.name);
        var diff = hasValidDifficulty(t);
        return diff && g !== 'done' && g !== 'rejected';
    }

    var dashDueWeek = reportUnits.filter(function(t) {
        var g = getStatusGroup(t.fields.status.name);
        return g !== 'done' && g !== 'rejected' && !hasDiffDash(t) && isDueInSelectedWeek(t);
    }).length;
    var dashBlocked = reportUnits.filter(function(t) {
        var g = getStatusGroup(t.fields.status.name);
        return g === 'blocked' || hasDiffDash(t);
    }).length;
    var dashDone = reportUnits.filter(function(t) { return getStatusGroup(t.fields.status.name) === 'done'; }).length;
    var dashPlanned = reportUnits.filter(function(t) {
        var g = getStatusGroup(t.fields.status.name);
        return g === 'planned' && !hasDiffDash(t);
    }).length;

    var totalTasksCount = reportUnits.length;
    var doneOnTimeCount = reportUnits.filter(function(t) { return getStatusGroup(t.fields.status.name) === 'done' && isDueInSelectedWeek(t); }).length;
    var rejectedCount = reportUnits.filter(function(t) { return getStatusGroup(t.fields.status.name) === 'rejected'; }).length;
    var notDoneDueWeekCount = reportUnits.filter(function(t) { 
        var g = getStatusGroup(t.fields.status.name);
        return g !== 'done' && g !== 'rejected' && isDueInSelectedWeek(t); 
    }).length;

    var summaryParts = [];
    if (totalTasksCount === 0) {
        summaryParts.push('Bu həftə ərzində icra olunan tapşırıq qeydə alınmayıb.');
    } else {
        var doneClause = '';
        if (dashDone === 0) {
            doneClause = 'onlardan heç biri tamamlanmayıb';
        } else if (doneOnTimeCount === 0) {
            doneClause = 'onlardan ' + dashDone + ' tapşırıq tamamlanıb';
        } else {
            doneClause = 'onlardan ' + dashDone + ' tapşırıq tamamlanıb (bunlardan ' + doneOnTimeCount + '-i məhz bu həftə olanlardır)';
        }
        summaryParts.push('Bu həftə ərzində ümumilikdə ' + totalTasksCount + ' tapşırıq üzərində iş aparılıb, ' + doneClause + '.');
    }

    if (notDoneDueWeekCount === 0) {
        summaryParts.push('Bu həftə bitməli olub, lakin tamamlanmayan tapşırıq yoxdur.');
    } else {
        summaryParts.push('Bu həftə bitməli olub, lakin tamamlanmayan ' + notDoneDueWeekCount + ' tapşırıq var.');
    }

    if (dashBlocked === 0 && rejectedCount === 0) {
        summaryParts.push('Hazırda çətinlik mövcud deyil və imtina edilən tapşırıq yoxdur.');
    } else if (dashBlocked === 0) {
        summaryParts.push('Hazırda çətinlik mövcud deyil, ' + rejectedCount + ' tapşırıqdan isə imtina edilib.');
    } else if (rejectedCount === 0) {
        summaryParts.push('Hazırda ' + dashBlocked + ' tapşırıq üzrə çətinlik mövcuddur, imtina edilən tapşırıq isə yoxdur.');
    } else {
        summaryParts.push('Hazırda ' + dashBlocked + ' tapşırıq üzrə çətinlik mövcuddur, ' + rejectedCount + ' tapşırıqdan isə imtina edilib.');
    }

    var carryoverCount = totalTasksCount - dashDone;
    if (carryoverCount < 0) carryoverCount = 0;
    if (carryoverCount === 0) {
        summaryParts.push('Növbəti həftəyə keçid edəcək tapşırıq yoxdur.');
    } else {
        summaryParts.push('Növbəti həftəyə ' + carryoverCount + ' tapşırıq keçid edəcək.');
    }

    var summaryText = summaryParts.join(' ');

    function statCell(numberText, labelText, isLast) {
        return new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: FILL_ROW, type: ShadingType.CLEAR, color: 'auto' },
            margins: { top: 160, bottom: 160, left: 140, right: 140 },
            borders: {
                top: { style: BorderStyle.SINGLE, size: 12, color: COL_INK },
                bottom: hairBorder,
                right: isLast ? noBorder : hairBorder,
                left: noBorder
            },
            children: [
                new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 40 },
                    children: [new TextRun({ text: String(numberText), bold: true, font: REPORT_FONT, size: FONT_SIZE, color: COL_INK })] }),
                new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 0 },
                    children: [new TextRun({ text: labelText, font: REPORT_FONT, size: FONT_SMALL, color: COL_MUTED })] })
            ]
        });
    }

    var statsTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [ new TableRow({ children: [
            statCell(dashDueWeek, 'İcrası bu həftə tamamlanmalı', false),
            statCell(dashBlocked, 'Mövcud çətinliklər', false),
            statCell(dashDone, 'Ümumi tamamlanan tapşırıq sayı', false),
            statCell(dashPlanned, 'Növbəti həftəyə tamamlanan olmalıdır', true)
        ] }) ]
    });

    function sectionHeading(num, t, desc) {
        var out = [new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 360, after: 40 },
            border: {
                bottom: { style: BorderStyle.SINGLE, size: 6, color: COL_LINE, space: 6 }
            },
            children: [
                new TextRun({ text: num + '  ', font: REPORT_FONT, size: FONT_H1, color: COL_MUTED }),
                new TextRun({ text: t, bold: true, font: REPORT_FONT, size: FONT_H1, color: COL_INK })
            ]
        })];
        if (desc) out.push(new Paragraph({
            spacing: { before: 80, after: 140 },
            children: [new TextRun({ text: desc, font: REPORT_FONT, size: FONT_SMALL, color: COL_MUTED })]
        }));
        return out;
    }

    function emptySectionNote(text) {
        return new Paragraph({
            spacing: { before: 80, after: 120 },
            children: [new TextRun({ text: text, font: REPORT_FONT, size: FONT_SIZE, color: COL_MUTED })]
        });
    }

    function appendReportSection(headingNodes, sectionNodes, emptyText) {
        children.push.apply(children, headingNodes);
        if (!sectionNodes || sectionNodes.length === 0) {
            children.push(emptySectionNote(emptyText));
        } else {
            children.push.apply(children, sectionNodes);
        }
    }

    function sectionDivider() {
        return new Paragraph({
            spacing: { before: 80, after: 40 },
            children: []
        });
    }

    var children = [];

    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 20 },
        children: [new TextRun({ text: 'Qiymətləndirmə və komplayens şöbəsi', font: REPORT_FONT, size: FONT_SMALL, color: COL_MUTED })]
    }));
    children.push(new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: 'Həftəlik İcra Hesabatı', bold: true, font: REPORT_FONT, size: FONT_TITLE, color: COL_INK })]
    }));
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 280 },
        border: {
            bottom: { style: BorderStyle.SINGLE, size: 12, color: COL_INK, space: 10 }
        },
        children: [new TextRun({ text: 'Əhatə olunan dövr  ·  ' + periodText, font: REPORT_FONT, size: FONT_SIZE, color: COL_MUTED })]
    }));

    children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [ new TableRow({ children: [
            new TableCell({
                width: { size: 100, type: WidthType.PERCENTAGE },
                shading: { fill: FILL_SOFT, type: ShadingType.CLEAR, color: 'auto' },
                margins: { top: 180, bottom: 180, left: 220, right: 220 },
                borders: {
                    top: noBorder,
                    bottom: noBorder,
                    left: { style: BorderStyle.SINGLE, size: 24, color: COL_INK },
                    right: noBorder
                },
                children: [
                    new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: 'HESABATIN İCMALI', bold: true, font: REPORT_FONT, size: FONT_SMALL, color: COL_MUTED })] }),
                    new Paragraph({ spacing: { after: 0, line: 300 }, children: [new TextRun({ text: summaryText, font: REPORT_FONT, size: FONT_SIZE, color: COL_BODY })] })
                ]
            })
        ] }) ]
    }));
    children.push(new Paragraph({ text: '', spacing: { after: 200 } }));
    children.push(statsTable);

    // 1. Görülən işlər
    var doneTasksPrint = getPrintTasks(function(t) { return getStatusGroup(t.fields.status.name) === 'done'; });
    appendReportSection(
        sectionHeading('1', 'Görülən işlər', 'Hesabat dövründə yekunlaşdırılmış işlər istiqamətlər üzrə.'),
        buildSection(doneTasksPrint, false, periodStart, periodEnd, function(t) { return getStatusGroup(t.fields.status.name) === 'done'; }, true),
        'Bu həftə tamamlanmış iş qeydə alınmayıb.'
    );
    children.push(sectionDivider());

    // 2. Nəyi edə bilmədik
    var notDoneDueTasksPrint = getPrintTasks(function(t) { 
        var g = getStatusGroup(t.fields.status.name);
        return g !== 'done' && g !== 'rejected' && isDueInSelectedWeek(t); 
    });
    appendReportSection(
        sectionHeading('2', 'Nəyi edə bilmədik', 'Bu həftə son icra müddəti (deadline) olan, lakin tamamlanmamış tapşırıqlar.'),
        buildSection(notDoneDueTasksPrint, false, periodStart, periodEnd, function(t) { 
            var g = getStatusGroup(t.fields.status.name);
            return g !== 'done' && g !== 'rejected' && isDueInSelectedWeek(t); 
        }),
        'Bu həftə bitməli olub, lakin tamamlanmayan tapşırıq yoxdur.'
    );
    children.push(sectionDivider());

    // 3. İcra mərhələsində olan və yarımçıq qalanlar
    var progressTasksPrint = getPrintTasks(function(t) { 
        var g = getStatusGroup(t.fields.status.name);
        return (g === 'progress' || g === 'other') && !isDueInSelectedWeek(t); 
    });
    appendReportSection(
        sectionHeading('3', 'İcra mərhələsində olan və yarımçıq qalanlar', 'Planlaşdırılmış, lakin hələ də icra mərhələsində olan işlər.'),
        buildSection(progressTasksPrint, false, periodStart, periodEnd, function(t) { 
            var g = getStatusGroup(t.fields.status.name);
            return (g === 'progress' || g === 'other') && !isDueInSelectedWeek(t); 
        }),
        'İcra mərhələsində yarımçıq qalan tapşırıq yoxdur.'
    );
    children.push(sectionDivider());

    // 4. Mövcud çətinliklər
    var problemTasksPrint = getPrintTasks(function(t) { 
        var g = getStatusGroup(t.fields.status.name);
        return g === 'blocked' || g === 'rejected' || hasValidDifficulty(t); 
    });
    appendReportSection(
        sectionHeading('4', 'Mövcud çətinliklər', 'İcra prosesində qarşılaşılan çətinliklər, bloklanan və imtina edilmiş işlər.'),
        buildSection(problemTasksPrint, true, periodStart, periodEnd, function(t) { 
            var g = getStatusGroup(t.fields.status.name);
            return g === 'blocked' || g === 'rejected' || hasValidDifficulty(t); 
        }),
        'Bu həftə mövcud çətinlik yaşanmamışdır.'
    );
    children.push(sectionDivider());

    // 5. Gələn həftə ərzində planlaşdırılanlar
    var plannedTasksPrint = getPrintTasks(function(t) { return getStatusGroup(t.fields.status.name) === 'planned'; });
    appendReportSection(
        sectionHeading('5', 'Gələn həftə ərzində planlaşdırılanlar', 'Növbəti həftə üçün əsas iş istiqamətləri və tapşırıqlar.'),
        buildSection(plannedTasksPrint, false, periodStart, periodEnd, function(t) { return getStatusGroup(t.fields.status.name) === 'planned'; }),
        'Növbəti həftəyə planlaşdırılan tapşırıq yoxdur.'
    );

    var doc = new Document({
        sections: [{
            properties: {
                titlePage: true,
                page: {
                    margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 }
                }
            },
            headers: {
                first: new Header({ children: [new Paragraph({ children: [] })] }),
                default: new Header({
                    children: [
                        new Paragraph({
                            border: {
                                bottom: { style: BorderStyle.SINGLE, size: 6, color: COL_LINE, space: 6 }
                            },
                            spacing: { after: 80 },
                            children: [
                                new TextRun({ text: 'Həftəlik İcra Hesabatı', font: REPORT_FONT, size: FONT_SMALL, color: COL_MUTED }),
                                new TextRun({ text: '   ·   ' + periodText, font: REPORT_FONT, size: FONT_SMALL, color: COL_MUTED })
                            ]
                        })
                    ]
                })
            },
            footers: {
                default: new Footer({
                    children: [
                        new Paragraph({
                            border: {
                                top: { style: BorderStyle.SINGLE, size: 6, color: COL_LINE, space: 8 }
                            },
                            spacing: { before: 60 },
                            children: [
                                new TextRun({ text: 'Qiymətləndirmə və komplayens şöbəsi  ·  səhifə ', font: REPORT_FONT, size: FONT_SMALL, color: COL_MUTED }),
                                new TextRun({ children: [PageNumber.CURRENT], font: REPORT_FONT, size: FONT_SMALL, color: COL_MUTED })
                            ]
                        })
                    ]
                })
            },
            children: children
        }],
        styles: {
            default: {
                document: { run: { color: COL_BODY, font: REPORT_FONT, size: FONT_SIZE } },
                title: { run: { font: REPORT_FONT, size: FONT_TITLE, color: COL_INK } },
                heading1: { run: { font: REPORT_FONT, size: FONT_H1, color: COL_INK } }
            }
        }
    });

    await downloadGeneratedDoc(doc, 'IRIA_Heftelik_Icra_Hesabati_' + dateStr.replace(/\//g, '_') + '.docx', 'Hesabat (.docx) uğurla yükləndi!');
}
