import { state } from './state.js';
import { normalizeStr, showToast } from './utils.js';
import { formatDateObj, getDifficultyField, getRawPhaseEntries, getSprintDateRange, getStatusGroup, hasValidDifficulty, isDueThisWeek, resolveDirection } from './model.js';

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
          HeadingLevel, AlignmentType, WidthType, ShadingType, BorderStyle, VerticalAlign } = docxLib;

    var COL_NAVY = '000000';    
    var COL_SLATE = '000000';   
    var COL_GREY = '000000';    
    var FILL_CARD = 'F2F2F2';   
    var BORDER_CARD = '1E3A8A'; 
    var REPORT_FONT = 'Arial';  
    var FONT_SIZE = 24;         

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

    // Word-a yazılacaq list üçün taskları və ya alt tapşırıqları götürürük
                function getPrintTasks(filterFn) {
        var printList = [];
        state.filteredTasks.forEach(function(t) {
            var st = normalizeStr(t.fields.status.name);
            var isPaused = st.includes('dayandır') || st.includes('dayandir') || st.includes('müvəqqəti') || st.includes('muveqqeti');
            if (isPaused) return;

            var typeNameSub = t.fields.issuetype ? normalizeStr(t.fields.issuetype.name) : '';
            if (typeNameSub.includes('alt') || typeNameSub.includes('sub')) return;

            // Əgər ana tapşırığın ÖZ statusu filterə uyğundursa, onu birbaça götürürük
            if (filterFn(t)) {
                printList.push(t);
            } else {
                // Əgər ana tapşırıq filterə uyğun deyilsə, alt tapşırıqlarını yoxlayırıq
                var hasMatchingChild = false;
                var subtasks = t.fields.subtasks || [];
                subtasks.forEach(function(sub) {
                    var subIssue = state.issueIndex[sub.key] || sub;
                    if (filterFn(subIssue)) hasMatchingChild = true;
                });

                if (!hasMatchingChild && t.fields.issuelinks && t.fields.issuelinks.length > 0) {
                    for (var i = 0; i < t.fields.issuelinks.length; i++) {
                        var linkedIssue = t.fields.issuelinks[i].outwardIssue || t.fields.issuelinks[i].inwardIssue;
                        if (linkedIssue && linkedIssue.fields && linkedIssue.fields.issuetype) {
                            var lType = normalizeStr(linkedIssue.fields.issuetype.name);
                            if (lType.includes('alt') || lType.includes('sub')) {
                                var subIssue = state.issueIndex[linkedIssue.key] || linkedIssue;
                                if (filterFn(subIssue)) {
                                    hasMatchingChild = true;
                                    break;
                                }
                            }
                        }
                    }
                }

                // Əgər uyğun gələn alt tapşırığı varsa, ana tapşırığı siyahıya əlavə edirik ki, onun altında mərhələləri toplayaq
                if (hasMatchingChild) {
                    printList.push(t);
                }
            }
        });
        return printList;
    }

    function buildSection(tasks, isProblemSection, periodStart, periodEnd, filterFn) {
        var nodes = [];
        var groups = groupByDirection(tasks);
        var dirNames = Object.keys(groups);
        dirNames.forEach(function(dirName, dirIdx) {
            nodes.push(new Paragraph({
                spacing: { before: 240, after: 100 },
                children: [new TextRun({ text: dirName.toLocaleUpperCase('az'), bold: true, font: REPORT_FONT, size: FONT_SIZE, color: COL_NAVY })]
            }));
            
            groups[dirName].forEach(function(t) {
                var taskText = t.fields.summary;
                var isOwnDone = filterFn(t);

                if (isProblemSection) {
                    var g = getStatusGroup(t.fields.status.name);
                    var diff = getDifficultyField(t);
                    if (g === 'rejected') taskText += ' — imtina';
                    else if (g === 'blocked') taskText += ' — bloklanıb';
                    else if (diff) taskText += ' — qarşılanan çətinlik: ' + diff;
                }

                // Ana tapşırığın başlığını yazırıq
                nodes.push(new Paragraph({
                    spacing: { after: 0 },
                    children: [
                        new TextRun({ text: '• ', bold: true, font: REPORT_FONT, size: FONT_SIZE, color: COL_NAVY }),
                        new TextRun({ text: taskText, bold: true, font: REPORT_FONT, size: FONT_SIZE, color: COL_NAVY })
                    ]
                }));

                var ownEntries = [];

                // Əgər ana tapşırığın ÖZ statusu filterə uyğundursa (məsələn, Özü "Həll edilib"dirsə)
                if (isOwnDone) {
                    // 1. Ana tapşırığın öz mərhələlərini götürürük
                    var parentEntries = getRawPhaseEntries(t, periodStart, periodEnd);
                    if (parentEntries.length > 0) {
                        ownEntries = ownEntries.concat(parentEntries);
                    }

                    // 2. Bütün alt tapşırıqların mərhələlərini yoxlayırıq
                    var subtasks = t.fields.subtasks || [];
                    subtasks.forEach(function(sub) {
                        var subIssue = state.issueIndex[sub.key] || sub;
                        var subEntries = getRawPhaseEntries(subIssue, periodStart, periodEnd);
                        if (subEntries.length > 0) {
                            ownEntries = ownEntries.concat(subEntries);
                        } else if (filterFn(subIssue)) {
                            // Əgər alt tapşırığın mərhələsi yoxdursa və özü də həll olunubsa, onun adını əlavə edirik
                            ownEntries.push({ date: null, text: subIssue.fields.summary });
                        }
                    });

                    // 3. Əlaqəli (Linked) alt tapşırıqları da yoxlayırıq
                    if (t.fields.issuelinks && t.fields.issuelinks.length > 0) {
                        t.fields.issuelinks.forEach(function(link) {
                            var linkedIssue = link.outwardIssue || link.inwardIssue;
                            if (linkedIssue && linkedIssue.fields && linkedIssue.fields.issuetype) {
                                var lType = normalizeStr(linkedIssue.fields.issuetype.name);
                                if (lType.includes('alt') || lType.includes('sub')) {
                                    var subIssue = state.issueIndex[linkedIssue.key] || linkedIssue;
                                    var subEntries = getRawPhaseEntries(subIssue, periodStart, periodEnd);
                                    if (subEntries.length > 0) {
                                        ownEntries = ownEntries.concat(subEntries);
                                    } else if (filterFn(subIssue)) {
                                        ownEntries.push({ date: null, text: subIssue.fields.summary });
                                    }
                                }
                            }
                        });
                    }
                } else {
                    // Əgər ana tapşırığın özü uyğun deyilsə (bitməyibsə), yalnız uyğun gələn (həll olunmuş) alt tapşırıqları götürürük
                    var subtasks = t.fields.subtasks || [];
                    subtasks.forEach(function(sub) {
                        var subIssue = state.issueIndex[sub.key] || sub;
                        if (filterFn(subIssue)) {
                            var subEntries = getRawPhaseEntries(subIssue, periodStart, periodEnd);
                            if (subEntries.length > 0) {
                                // Mərhələsi varsa, yalnız mərhələni götürürük
                                ownEntries = ownEntries.concat(subEntries);
                            } else {
                                // Mərhələsi yoxdursa, alt tapşırığın öz adını götürürük
                                ownEntries.push({ date: null, text: subIssue.fields.summary });
                            }
                        }
                    });
                    
                    if (t.fields.issuelinks && t.fields.issuelinks.length > 0) {
                        t.fields.issuelinks.forEach(function(link) {
                            var linkedIssue = link.outwardIssue || link.inwardIssue;
                            if (linkedIssue && linkedIssue.fields && linkedIssue.fields.issuetype) {
                                var lType = normalizeStr(linkedIssue.fields.issuetype.name);
                                if (lType.includes('alt') || lType.includes('sub')) {
                                    var subIssue = state.issueIndex[linkedIssue.key] || linkedIssue;
                                    if (filterFn(subIssue)) {
                        var subEntries = getRawPhaseEntries(subIssue, periodStart, periodEnd);
                        if (subEntries.length > 0) {
                            ownEntries = ownEntries.concat(subEntries);
                        } else {
                            ownEntries.push({ date: null, text: subIssue.fields.summary });
                        }
                    }
                                }
                            }
                        });
                    }
                }

                               // Bütün mərhələləri və adları tarixə görə sıralayıb alt sətirdə yazırıq
                ownEntries.sort(function(a, b) { 
                    var timeA = a.date ? a.date.getTime() : 0;
                    var timeB = b.date ? b.date.getTime() : 0;
                    return timeA - timeB; 
                });
                
                // Mərhələləri və alt tapşırıqları axıcı şəkildə birləşdiririk
                var phaseText2 = ownEntries.map(function(e) {
                    if (!e.date) {
                        // Tarix yoxdursa, bu alt tapşırığın adıdır
                        return e.text;
                    } else {
                        // Tarix varsa: 24.08.2026 tarixində [mətn]
                        return formatDateObj(e.date) + ' tarixində ' + e.text;
                    }
                }).join('. '); // Hər mərhələnin sonuna nöqtə qoyuruq ki, aydın ayrılsın
                
                if (phaseText2) {
                    // Əgər mətn bitibsə artıq nöqtə var, yoxdursa əlavə edirik
                    if (!phaseText2.endsWith('.')) phaseText2 += '.';
                    
                    nodes.push(new Paragraph({
                        spacing: { after: 60 },
                        indent: { left: 360 },
                        children: [
                            new TextRun({ text: phaseText2, italics: true, font: REPORT_FONT, size: FONT_SIZE, color: COL_GREY })
                        ]
                    }));
                } else {
                    nodes.push(new Paragraph({ spacing: { after: 60 }, children: [] }));
                }
            });
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

    var summaryText = 'Bu həftə ərzində ümumilikdə ' + totalTasksCount + ' tapşırıq üzərində iş aparılıb, onlardan ' +
        dashDone + ' tapşırıq tamamlanıb (bunlardan ' + doneOnTimeCount + '-i məhz bu həftə bitməli idi). ' +
        'Bu həftə bitməli olub, lakin tamamlanmayan ' + notDoneDueWeekCount + ' tapşırıq var. ' +
        'Hazırda ' + dashBlocked + ' tapşırıq üzrə çətinlik mövcuddur, ' + rejectedCount +
        ' tapşırıqdan isə imtina edilib. Növbəti həftəyə ' + dashPlanned + ' tapşırıq planlaşdırılıb.';

    function statCell(numberText, labelText) {
        return new TableCell({
            width: { size: 25, type: WidthType.PERCENTAGE },
            verticalAlign: VerticalAlign.CENTER,
            shading: { fill: FILL_CARD, type: ShadingType.CLEAR, color: 'auto' },
            margins: { top: 140, bottom: 140, left: 160, right: 160 },
            borders: {
                top: { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' },
                bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' },
                right: { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' },
                left: { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' }
            },
            children: [
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 30 },
                    children: [new TextRun({ text: String(numberText), bold: true, font: REPORT_FONT, size: FONT_SIZE + 14, color: COL_NAVY })] }),
                new Paragraph({ alignment: AlignmentType.CENTER, spacing: { after: 0 },
                    children: [new TextRun({ text: labelText, font: REPORT_FONT, size: FONT_SIZE - 6, color: '595959' })] })
            ]
        });
    }

    var statsTable = new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [ new TableRow({ children: [
            statCell(dashDueWeek, 'Bu həftə bitməli olan tapşırıqlar'),
            statCell(dashBlocked, 'Mövcud çətinliklər'),
            statCell(dashDone, 'Tamamlanan tapşırıqlar'),
            statCell(dashPlanned, 'Növbəti həftəyə planlaşdırılanlar')
        ] }) ]
    });

    function sectionHeading(num, t, desc) {
        var out = [new Paragraph({
            heading: HeadingLevel.HEADING_1,
            spacing: { before: 320, after: 60 },
            children: [new TextRun({ text: num + '. ' + t, bold: true, font: REPORT_FONT, size: FONT_SIZE, color: COL_NAVY })]
        })];
        if (desc) out.push(new Paragraph({
            spacing: { after: 120 },
            children: [new TextRun({ text: desc, italics: true, font: REPORT_FONT, size: FONT_SIZE, color: COL_GREY })]
        }));
        return out;
    }

    function sectionDivider() {
        return new Paragraph({
            spacing: { before: 160, after: 0 },
            border: {
                bottom: { style: BorderStyle.SINGLE, size: 4, color: 'BFBFBF', space: 4 }
            },
            children: []
        });
    }

    var children = [];

    children.push(new Paragraph({
        heading: HeadingLevel.TITLE,
        alignment: AlignmentType.CENTER,
        spacing: { after: 40 },
        children: [new TextRun({ text: 'Həftəlik İcra Hesabatı', bold: true, font: REPORT_FONT, size: FONT_SIZE + 8, color: COL_NAVY })]
    }));
    children.push(new Paragraph({
        alignment: AlignmentType.CENTER,
        spacing: { after: 260 },
        border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: 'BFBFBF', space: 8 }
        },
        children: [new TextRun({ text: 'Əhatə olunan dövr: ' + periodText, font: REPORT_FONT, size: FONT_SIZE, color: COL_GREY })]
    }));

    children.push(new Table({
        width: { size: 100, type: WidthType.PERCENTAGE },
        rows: [ new TableRow({ children: [
            new TableCell({
                width: { size: 100, type: WidthType.PERCENTAGE },
                shading: { fill: FILL_CARD, type: ShadingType.CLEAR, color: 'auto' },
                margins: { top: 160, bottom: 160, left: 200, right: 200 },
                borders: {
                    top: { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' },
                    bottom: { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' },
                    left: { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' },
                    right: { style: BorderStyle.SINGLE, size: 4, color: 'D9D9D9' }
                },
                children: [
                    new Paragraph({ spacing: { after: 60 }, children: [new TextRun({ text: 'Hesabatın icmalı', bold: true, font: REPORT_FONT, size: FONT_SIZE, color: COL_NAVY })] }),
                    new Paragraph({ spacing: { after: 0 }, children: [new TextRun({ text: summaryText, bold: true, font: REPORT_FONT, size: FONT_SIZE, color: COL_SLATE })] })
                ]
            })
        ] }) ]
    }));
    children.push(new Paragraph({ text: '', spacing: { after: 220 } }));
    children.push(statsTable);

    // 1. Görülən işlər
    var doneTasksPrint = getPrintTasks(function(t) { return getStatusGroup(t.fields.status.name) === 'done'; });
    children.push.apply(children, sectionHeading('1', 'Görülən işlər', 'Hesabat dövründə yekunlaşdırılmış işlər istiqamətlər üzrə.'));
    children.push.apply(children, buildSection(doneTasksPrint, false, periodStart, periodEnd, function(t) { return getStatusGroup(t.fields.status.name) === 'done'; }));
    children.push(sectionDivider());

    // 2. Nəyi edə bilmədik
    var notDoneDueTasksPrint = getPrintTasks(function(t) { 
        var g = getStatusGroup(t.fields.status.name);
        return g !== 'done' && g !== 'rejected' && isDueThisWeek(t); 
    });
    children.push.apply(children, sectionHeading('2', 'Nəyi edə bilmədik', 'Bu həftə son icra müddəti (deadline) olan, lakin tamamlanmamış tapşırıqlar.'));
    children.push.apply(children, buildSection(notDoneDueTasksPrint, false, periodStart, periodEnd, function(t) { 
        var g = getStatusGroup(t.fields.status.name);
        return g !== 'done' && g !== 'rejected' && isDueThisWeek(t); 
    }));
    children.push(sectionDivider());

    // 3. İcra mərhələsində olan və yarımçıq qalanlar
    var progressTasksPrint = getPrintTasks(function(t) { 
        var g = getStatusGroup(t.fields.status.name);
        return (g === 'progress' || g === 'other') && !isDueThisWeek(t); 
    });
    children.push.apply(children, sectionHeading('3', 'İcra mərhələsində olan və yarımçıq qalanlar', 'Planlaşdırılmış, lakin hələ də icra mərhələsində olan işlər.'));
    children.push.apply(children, buildSection(progressTasksPrint, false, periodStart, periodEnd, function(t) { 
        var g = getStatusGroup(t.fields.status.name);
        return (g === 'progress' || g === 'other') && !isDueThisWeek(t); 
    }));
    children.push(sectionDivider());

    // 4. Mövcud çətinliklər
    var problemTasksPrint = getPrintTasks(function(t) { 
        var g = getStatusGroup(t.fields.status.name);
        return g === 'blocked' || g === 'rejected' || hasValidDifficulty(t); 
    });
    children.push.apply(children, sectionHeading('4', 'Mövcud çətinliklər', 'İcra prosesində qarşılaşılan çətinliklər, bloklanan və imtina edilmiş işlər.'));
    children.push.apply(children, buildSection(problemTasksPrint, true, periodStart, periodEnd, function(t) { 
        var g = getStatusGroup(t.fields.status.name);
        return g === 'blocked' || g === 'rejected' || hasValidDifficulty(t); 
    }));
    children.push(sectionDivider());

    // 5. Gələn həftə ərzində planlaşdırılanlar
    var plannedTasksPrint = getPrintTasks(function(t) { return getStatusGroup(t.fields.status.name) === 'planned'; });
    children.push.apply(children, sectionHeading('5', 'Gələn həftə ərzində planlaşdırılanlar', 'Növbəti həftə üçün əsas iş istiqamətləri və tapşırıqlar.'));
    children.push.apply(children, buildSection(plannedTasksPrint, false, periodStart, periodEnd, function(t) { return getStatusGroup(t.fields.status.name) === 'planned'; }));

    var doc = new Document({
        sections: [{ properties: {}, children: children }],
        styles: {
            default: {
                document: { run: { color: COL_SLATE, font: REPORT_FONT, size: FONT_SIZE } },
                title: { run: { font: REPORT_FONT, size: FONT_SIZE } },
                heading1: { run: { font: REPORT_FONT, size: FONT_SIZE } }
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
