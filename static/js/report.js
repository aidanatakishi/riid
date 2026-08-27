import { state } from './state.js';
import { normalizeStr, showToast } from './utils.js';
import { formatDateObj, getBlockReason, getDatedPhaseEntries, getDifficultyField, getIssueFallbackDate, getParentIssue, lowercasePhaseTextAfterDate, parsePhaseEntriesFromText, selectPhasesForReport, getSprintDateRange, getStatusGroup, hasPhaseText, hasValidDifficulty, isDueThisWeek, resolveDirection } from './model.js';

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
        if (isOwnDone || !restrictToPeriod) issues.push(t);
        (childIssues || []).forEach(function(subIssue) {
            if (restrictToPeriod && !isOwnDone && !issueMatches(subIssue, filterFn)) return;
            issues.push(subIssue);
        });
        return issues;
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
        return selectPhasesForReport(allDated, periodStart, periodEnd);
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
        (entries || []).forEach(function(entry) {
            var line = formatEntryLine(entry);
            if (line) childLines.push(line);
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

    function getPrintTasks(filterFn) {
        var printList = [];
        var seen = {};
        function addParent(t) {
            if (!t || !t.key || seen[t.key] || isPausedTask(t)) return;
            if (isSubtaskType(t)) return;
            seen[t.key] = true;
            printList.push(t);
        }
        state.filteredTasks.forEach(function(t) {
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

    function hasDiffDash(t) {
        var g = getStatusGroup(t.fields.status.name);
        var diff = hasValidDifficulty(t);
        return diff && g !== 'done' && g !== 'rejected';
    }

    var dashDueWeek = reportUnits.filter(function(t) {
        var g = getStatusGroup(t.fields.status.name);
        return g !== 'done' && g !== 'rejected' && !hasDiffDash(t) && isDueThisWeek(t);
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
    var doneOnTimeCount = reportUnits.filter(function(t) { return getStatusGroup(t.fields.status.name) === 'done' && isDueThisWeek(t); }).length;
    var rejectedCount = reportUnits.filter(function(t) { return getStatusGroup(t.fields.status.name) === 'rejected'; }).length;
    var notDoneDueWeekCount = reportUnits.filter(function(t) { 
        var g = getStatusGroup(t.fields.status.name);
        return g !== 'done' && g !== 'rejected' && isDueThisWeek(t); 
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
            doneClause = 'onlardan ' + dashDone + ' tapşırıq tamamlanıb (bunlardan ' + doneOnTimeCount + '-i məhz bu həftə bitməli idi)';
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

    if (dashPlanned === 0) {
        summaryParts.push('Növbəti həftəyə planlaşdırılan tapşırıq yoxdur.');
    } else {
        summaryParts.push('Növbəti həftəyə ' + dashPlanned + ' tapşırıq planlaşdırılıb.');
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
            statCell(dashDueWeek, 'Bu həftə bitməli', false),
            statCell(dashBlocked, 'Mövcud çətinliklər', false),
            statCell(dashDone, 'Tamamlananlar', false),
            statCell(dashPlanned, 'Növbəti həftə', true)
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
        return g !== 'done' && g !== 'rejected' && isDueThisWeek(t); 
    });
    appendReportSection(
        sectionHeading('2', 'Nəyi edə bilmədik', 'Bu həftə son icra müddəti (deadline) olan, lakin tamamlanmamış tapşırıqlar.'),
        buildSection(notDoneDueTasksPrint, false, periodStart, periodEnd, function(t) { 
            var g = getStatusGroup(t.fields.status.name);
            return g !== 'done' && g !== 'rejected' && isDueThisWeek(t); 
        }),
        'Bu həftə bitməli olub, lakin tamamlanmayan tapşırıq yoxdur.'
    );
    children.push(sectionDivider());

    // 3. İcra mərhələsində olan və yarımçıq qalanlar
    var progressTasksPrint = getPrintTasks(function(t) { 
        var g = getStatusGroup(t.fields.status.name);
        return (g === 'progress' || g === 'other') && !isDueThisWeek(t); 
    });
    appendReportSection(
        sectionHeading('3', 'İcra mərhələsində olan və yarımçıq qalanlar', 'Planlaşdırılmış, lakin hələ də icra mərhələsində olan işlər.'),
        buildSection(progressTasksPrint, false, periodStart, periodEnd, function(t) { 
            var g = getStatusGroup(t.fields.status.name);
            return (g === 'progress' || g === 'other') && !isDueThisWeek(t); 
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

    try {
        var blob = await Packer.toBlob(doc);
        var url = URL.createObjectURL(blob);
        var fileDownload = document.createElement('a');
        document.body.appendChild(fileDownload);
        fileDownload.href = url;
        fileDownload.download = 'IRIA_Heftelik_Icra_Hesabati_' + dateStr.replace(/\//g, '_') + '.docx';
        fileDownload.click();
        document.body.removeChild(fileDownload);
        URL.revokeObjectURL(url);
        showToast('Hesabat (.docx) uğurla yükləndi!', 'success');
    } catch (err) {
        console.error(err);
        showToast('Hesabat yaradılarkən xəta baş verdi: ' + err.message, 'error');
    }
}
