import { state } from './state.js';
import { normalizeStr, showToast } from './utils.js';
import { formatDateObj, getBlockReason, getDatedPhaseEntries, getDifficultyField, getIssueFallbackDate, getParentIssue, lowercasePhaseTextAfterDate, parsePhaseEntriesFromText, selectPhasesForReport, getSprintDateRange, getStatusGroup, getQurumName, getAssessmentQurumLabel, getTaskStartDate, getTaskDueDate, hasPhaseText, hasValidDifficulty, isActiveExecutionGroup, isDateInReportPeriod, isDueInDateRange, isDueInSelectedWeek, isSubtaskType, isTaskType, isTaskOrSubtaskType, resolveDirection, getRawPhaseEntries, PHASE_FIELDS, sameQurum, qurumMatchKey, taskBelongsToDateRange, countableWorkUnits, getSprintNames, currentSprintName, getBakuWeekRange, collectDueThisWeekTasks, collectDueThisWeekDoneTasks } from './model.js';

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
var AZ_MONTHS_FILE = ['Yanvar', 'Fevral', 'Mart', 'Aprel', 'May', 'İyun', 'İyul', 'Avqust', 'Sentyabr', 'Oktyabr', 'Noyabr', 'Dekabr'];

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

function isCalendarMonthStart(d) {
    return d && d.getDate() === 1;
}

function isCalendarMonthEnd(d) {
    if (!d) return false;
    return d.getDate() === new Date(d.getFullYear(), d.getMonth() + 1, 0).getDate();
}

function listCoveredMonths(start, end) {
    var out = [];
    var y = start.getFullYear();
    var m = start.getMonth();
    var endY = end.getFullYear();
    var endM = end.getMonth();
    while (y < endY || (y === endY && m <= endM)) {
        out.push({
            year: y,
            month: m,
            monthName: AZ_MONTHS_LOWER[m],
            fileMonth: AZ_MONTHS_FILE[m]
        });
        m += 1;
        if (m > 11) {
            m = 0;
            y += 1;
        }
    }
    return out;
}

export function getMonthRangeInfo(startIso, endIso) {
    var start = parseReportIsoDate(startIso);
    var end = parseReportIsoDate(endIso);
    if (!start || !end || end < start) return null;
    var covered = listCoveredMonths(start, end);
    if (!covered.length) return null;
    var lastDayOfEndMonth = new Date(end.getFullYear(), end.getMonth() + 1, 0).getDate();
    var days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    var fullSpan = isCalendarMonthStart(start) && isCalendarMonthEnd(end);
    var singleMonthOk = covered.length === 1 && (
        fullSpan
        || (isCalendarMonthStart(start) && end.getDate() >= Math.min(28, lastDayOfEndMonth))
        || days >= 28
    );
    var multiMonthOk = covered.length >= 2 && (
        fullSpan
        || (isCalendarMonthStart(start) && end.getDate() >= Math.min(28, lastDayOfEndMonth))
        || days >= 45
    );
    if (!singleMonthOk && !multiMonthOk) return null;
    var names = covered.map(function(c) { return c.monthName; });
    var fileNames = covered.map(function(c) { return c.fileMonth; });
    var monthName = names.length === 1 ? names[0] : (names[0] + '–' + names[names.length - 1]);
    var fileMonth = fileNames.length === 1 ? fileNames[0] : (fileNames[0] + '-' + fileNames[fileNames.length - 1]);
    return {
        year: covered[0].year,
        endYear: covered[covered.length - 1].year,
        month: covered[0].month,
        start: start,
        end: end,
        monthName: monthName,
        monthNames: names,
        monthCount: covered.length,
        fileMonth: fileMonth,
        months: covered
    };
}

function monthInfoForCovered(item) {
    if (!item || typeof item.month !== 'number' || typeof item.year !== 'number') return null;
    var start = new Date(item.year, item.month, 1);
    start.setHours(0, 0, 0, 0);
    var end = new Date(item.year, item.month + 1, 0);
    end.setHours(0, 0, 0, 0);
    var monthName = item.monthName || AZ_MONTHS_LOWER[item.month];
    var fileMonth = item.fileMonth || AZ_MONTHS_FILE[item.month];
    return {
        year: item.year,
        endYear: item.year,
        month: item.month,
        start: start,
        end: end,
        monthName: monthName,
        monthNames: [monthName],
        monthCount: 1,
        fileMonth: fileMonth,
        months: [{
            year: item.year,
            month: item.month,
            monthName: monthName,
            fileMonth: fileMonth
        }]
    };
}

function startOfDay(d) {
    if (!d) return null;
    var out = new Date(d.getFullYear(), d.getMonth(), d.getDate());
    out.setHours(0, 0, 0, 0);
    return out;
}

function weekInfoFromDates(start, end, extra) {
    var s = startOfDay(start);
    var e = startOfDay(end);
    if (!s || !e) return null;
    return Object.assign({
        start: s,
        end: e,
        year: s.getFullYear(),
        endYear: e.getFullYear()
    }, extra || {});
}

function mondayOnOrBefore(d) {
    var day = d.getDay();
    var diff = day === 0 ? -6 : 1 - day;
    var m = new Date(d.getFullYear(), d.getMonth(), d.getDate() + diff);
    m.setHours(0, 0, 0, 0);
    return m;
}

function listCoveredCalendarWeeks(start, end) {
    var out = [];
    var cursor = mondayOnOrBefore(start);
    var last = startOfDay(end);
    while (cursor <= last) {
        var wStart = new Date(cursor);
        var wEnd = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 6);
        wEnd.setHours(0, 0, 0, 0);
        var clipStart = wStart < start ? startOfDay(start) : wStart;
        var clipEnd = wEnd > last ? last : wEnd;
        if (clipEnd >= clipStart) out.push(weekInfoFromDates(clipStart, clipEnd));
        cursor = new Date(cursor.getFullYear(), cursor.getMonth(), cursor.getDate() + 7);
    }
    return out;
}

export function getWeekRangeInfo(startIso, endIso) {
    if (getMonthRangeInfo(startIso, endIso)) return null;
    var start = parseReportIsoDate(startIso);
    var end = parseReportIsoDate(endIso);
    if (!start || !end || end < start) return null;
    var days = Math.round((end.getTime() - start.getTime()) / 86400000) + 1;
    var covered = listCoveredCalendarWeeks(start, end);
    if (days >= 5 && days <= 9) {
        return { weeks: [weekInfoFromDates(start, end)], weekCount: 1, start: start, end: end };
    }
    if (covered.length >= 2) {
        return { weeks: covered, weekCount: covered.length, start: start, end: end };
    }
    return null;
}

export function isCustomDateFilterActive() {
    var startEl = document.getElementById('startDate');
    var endEl = document.getElementById('endDate');
    return !!((startEl && startEl.value) || (endEl && endEl.value));
}

function selectedSprintFilterName() {
    var el = document.getElementById('sprintFilter');
    var val = el && el.value;
    if (!val || val === 'all') return '';
    return val;
}

function listedSprintNames() {
    var el = document.getElementById('sprintFilter');
    if (!el) return [];
    return Array.from(el.options).slice(1).map(function(o) { return o.value; }).filter(Boolean);
}

export function isBuHefteMode() {
    if (isCustomDateFilterActive()) return false;
    var sprintVal = selectedSprintFilterName();
    if (!sprintVal) return false;
    var current = currentSprintName(listedSprintNames());
    return !!(current && sprintVal === current);
}

export function isSprintWeekMode() {
    return !isCustomDateFilterActive() && !!selectedSprintFilterName();
}

function getSprintWeeklyExport() {
    if (!isSprintWeekMode()) return null;
    var sprintName = selectedSprintFilterName();
    if (!sprintName) return null;
    var range = getSprintDateRange(sprintName);
    var start;
    var end;
    if (range && range.start && range.end) {
        start = startOfDay(range.start);
        end = startOfDay(range.end);
    } else {
        var baku = getBakuWeekRange(0);
        start = startOfDay(baku.start);
        end = startOfDay(baku.end);
    }
    return {
        info: weekInfoFromDates(start, end, { sprintName: sprintName }),
        opts: {
            kind: 'week',
            sourceMode: 'sprint',
            sprintName: sprintName,
            icmalMode: 'week'
        }
    };
}

function weeklyFileName(info) {
    var a = formatDateObj(info.start);
    var b = formatDateObj(info.end);
    return 'Həftəlik hesabat ' + a.slice(0, 5) + '-' + b + '.docx';
}

function weeklyDownloadToast(infos) {
    if (!infos || !infos.length) return 'Həftəlik hesabat (.docx) uğurla yükləndi!';
    if (infos.length === 1) return 'Həftəlik hesabat (.docx) uğurla yükləndi!';
    return infos.length + ' həftəlik hesabat yükləndi.';
}

function delayMs(ms) {
    return new Promise(function(resolve) { setTimeout(resolve, ms); });
}

function joinAzNames(names) {
    if (!names || !names.length) return '';
    if (names.length === 1) return names[0];
    if (names.length === 2) return names[0] + ' və ' + names[1];
    return names.slice(0, -1).join(', ') + ' və ' + names[names.length - 1];
}

function monthlyPeriodPhrase(info) {
    var item = info && info.months && info.months.length ? info.months[0] : info;
    var year = item && item.year;
    var name = item && item.monthName;
    return azYearMark(year) + ' ilin ' + name + ' ayı';
}

export function updateReportButtonLabel() {
    var el = document.getElementById('reportDownloadLabel');
    if (!el) return;
    var startEl = document.getElementById('startDate');
    var endEl = document.getElementById('endDate');
    var startIso = startEl && startEl.value;
    var endIso = endEl && endEl.value;
    var month = getMonthRangeInfo(startIso, endIso);
    if (month) {
        el.textContent = month.monthCount > 1 ? 'Aylıq hesabatları yüklə' : 'Aylıq hesabatı yüklə';
        return;
    }
    if (isSprintWeekMode()) {
        el.textContent = 'Həftəlik hesabatı yüklə';
        return;
    }
    var week = getWeekRangeInfo(startIso, endIso);
    if (week) {
        el.textContent = week.weekCount > 1 ? 'Həftəlik hesabatları yüklə' : 'Həftəlik hesabatı yüklə';
        return;
    }
    el.textContent = 'Hesabatı yüklə';
}

export function isSelectedMonthRange() {
    var startEl = document.getElementById('startDate');
    var endEl = document.getElementById('endDate');
    return !!getMonthRangeInfo(startEl && startEl.value, endEl && endEl.value);
}

export function duePeriodLabel() {
    var startEl = document.getElementById('startDate');
    var endEl = document.getElementById('endDate');
    var month = getMonthRangeInfo(startEl && startEl.value, endEl && endEl.value);
    if (!month) return 'Bu həftə bitməli';
    return month.monthCount > 1 ? 'Bu dövr bitməli' : 'Bu ay bitməli';
}

var CANON_ORDER = ['reyestr', 'meqsed', 'diag', 'isq', 'exq', 'inteqrasiya', 'diger'];
var CANON_TITLES = {
    reyestr: 'Vahid Reyestr üzrə:',
    meqsed: 'Məqsədəuyğunluq rəyi üzrə:',
    diag: 'Rəqəmsallaşma səviyyəsinin diaqnostikası üzrə:',
    isq: 'İnformasiya ehtiyat və sistemlərinin qiymətləndirilməsi üzrə:',
    exq: 'Elektron xidmətlərin qiymətləndirilməsi üzrə:',
    inteqrasiya: 'Məlumat hədlərinin inteqrasiyası üzrə:',
    diger: 'Digər istiqamətlər üzrə:'
};

function canonicalSectionId(dirName) {
    var n = normalizeStr(dirName || '');
    if (n.indexOf('reyestr') !== -1) return 'reyestr';
    if (n.indexOf('məqsədəuyğun') !== -1 || n.indexOf('meqseduygun') !== -1) return 'meqsed';
    if (n.indexOf('diaqnostika') !== -1 || n.indexOf('rəqəmsallaşma') !== -1 || n.indexOf('reqemsallasma') !== -1 || n.indexOf('özünüqiymət') !== -1 || n.indexOf('ozunuqiymet') !== -1) return 'diag';
    if (n.indexOf('elektron xidmət') !== -1 || n.indexOf('elektron xidmet') !== -1) return 'exq';
    if ((n.indexOf('ehtiyat') !== -1 || n.indexOf('sistem') !== -1) && (n.indexOf('qiymət') !== -1 || n.indexOf('qiymet') !== -1)) return 'isq';
    if (n.indexOf('inteqras') !== -1 || n.indexOf('məlumat hədd') !== -1 || n.indexOf('melumat hedd') !== -1 || n.indexOf('digital') !== -1) return 'inteqrasiya';
    return 'diger';
}

function monthlyIntroForCanon(id, period) {
    if (id === 'reyestr') {
        return '“Dövlət informasiya ehtiyatlarının, sistemlərinin və elektron xidmətlərin vahid reyestri”nin (bundan sonra - Reyestr) “İnformasiya ehtiyat və sistemləri reyestri” modulu vasitəsilə ' + period + ' ərzində aşağıdakı sistemlər qeydiyyata alınmışdır:';
    }
    if (id === 'meqsed') {
        return 'Qurumların informasiya sistemləri və ehtiyatlarına, habelə elektron xidmətlərinə onların texniki və səmərəliliyi baxımından məqsədəuyğunluğuna dair rəyin verilməsi üzrə:';
    }
    if (id === 'diag') {
        return 'Qurumlarda rəqəmsallaşma səviyyəsinin diaqnostikasının aparılması məqsədilə aşağıdakı tədbirlər həyata keçirilmişdir:';
    }
    if (id === 'inteqrasiya') {
        return 'Məlumat hədlərinin “Rəqəmsal Məlumat Mübadiləsi” (“Digital Bridge”) altsistemi üzərindən inteqrasiyası ilə bağlı müraciət etmiş aşağıdakı qurumların inteqrasiya sorğularına müvafiq rəylər verilmişdir:';
    }
    return '';
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
          AlignmentType, WidthType, ShadingType, BorderStyle, VerticalAlign,
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
    var FONT_SIZE = 22;
    var FONT_SMALL = 18;
    var FONT_PHASE = 20;

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
                    if (isSubtaskType(linkedIssue)) {
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

    function isPausedTask(t) {
        if (!t || !t.fields || !t.fields.status) return false;
        var st = normalizeStr(t.fields.status.name);
        return st.includes('dayandır') || st.includes('dayandir') || st.includes('müvəqqəti') || st.includes('muveqqeti');
    }

    function hasDiffDash(t) {
        var g = getStatusGroup(t.fields.status.name);
        var diff = hasValidDifficulty(t);
        return diff && g !== 'done' && g !== 'rejected';
    }

    function collectDashboardKpis(units, dueFn) {
        units = units || [];
        dueFn = dueFn || isDueInSelectedWeek;
        var due = 0, blocked = 0, done = 0, planned = 0;
        var doneInPeriod = 0, rejected = 0, notDoneDue = 0, duePool = 0;
        units.forEach(function(t) {
            if (!t || !t.fields || !t.fields.status) return;
            var g = getStatusGroup(t.fields.status.name);
            var diff = hasDiffDash(t);
            var inDue = !!dueFn(t);
            if (g === 'done') done++;
            if (g === 'rejected') rejected++;
            if (g === 'blocked' || diff) blocked++;
            if (g !== 'done' && g !== 'rejected' && !diff && inDue) due++;
            if (g === 'planned' && !diff) planned++;
            if (g === 'done' && inDue) doneInPeriod++;
            if (g !== 'done' && g !== 'rejected' && inDue) notDoneDue++;
            if (inDue && g !== 'rejected') duePool++;
        });
        var total = units.length;
        var carryover = total - done;
        if (carryover < 0) carryover = 0;
        return {
            total: total,
            due: due,
            blocked: blocked,
            done: done,
            planned: planned,
            doneInPeriod: doneInPeriod,
            rejected: rejected,
            notDoneDue: notDoneDue,
            carryover: carryover,
            dueDisplay: String(doneInPeriod) + ' / ' + String(duePool)
        };
    }

    function collectVisibleDashboardKpis() {
        var tasks = state.filteredTasks || [];
        var validTasks = countableWorkUnits(tasks);
        function hasDiff(t) {
            var g = getStatusGroup(t.fields.status.name || '');
            return hasValidDifficulty(t) && g !== 'done' && g !== 'rejected';
        }
        var total = validTasks.length;
        var done = 0;
        var blocked = 0;
        var planned = 0;
        validTasks.forEach(function(t) {
            var g = getStatusGroup(t.fields.status.name || '');
            var diff = hasDiff(t);
            if (g === 'done') done++;
            if (g === 'blocked' || diff) blocked++;
            if (g === 'planned' && !diff) planned++;
        });
        var rejected = tasks.filter(function(t) {
            return isTaskType(t) && getStatusGroup(t.fields.status.name || '') === 'rejected';
        }).length;
        var due = collectDueThisWeekTasks().length;
        var doneInPeriod = collectDueThisWeekDoneTasks().length;
        var notDoneDue = due - doneInPeriod;
        if (notDoneDue < 0) notDoneDue = 0;
        var carryover = total - done;
        if (carryover < 0) carryover = 0;
        return {
            total: total,
            due: due,
            blocked: blocked,
            done: done,
            planned: planned,
            doneInPeriod: doneInPeriod,
            rejected: rejected,
            notDoneDue: notDoneDue,
            carryover: carryover,
            dueDisplay: String(doneInPeriod) + ' / ' + String(due)
        };
    }

    function icmalPeriodCopy(mode) {
        if (mode === true || mode === 'month') {
            return {
                empty: 'Bu ay ərzində icra olunan tapşırıq qeydə alınmayıb.',
                during: 'Bu ay ərzində ümumilikdə ',
                thisPeriod: 'bu ay',
                overdueEmpty: 'Bu ay bitməli olub, lakin tamamlanmayan tapşırıq yoxdur.',
                overduePrefix: 'Bu ay bitməli olub, lakin tamamlanmayan ',
                nextEmpty: 'Növbəti aya keçid edəcək tapşırıq yoxdur.',
                nextPrefix: 'Növbəti aya ',
                dueLabel: 'İcrası bu ay tamamlanmalı',
                nextLabel: 'Növbəti aya tamamlanan olmalıdır'
            };
        }
        if (mode === 'period') {
            return {
                empty: 'Bu aylar ərzində icra olunan tapşırıq qeydə alınmayıb.',
                during: 'Bu aylar ərzində ümumilikdə ',
                thisPeriod: 'bu dövr',
                overdueEmpty: 'Bu dövrdə bitməli olub, lakin tamamlanmayan tapşırıq yoxdur.',
                overduePrefix: 'Bu dövrdə bitməli olub, lakin tamamlanmayan ',
                nextEmpty: 'Növbəti dövrə keçid edəcək tapşırıq yoxdur.',
                nextPrefix: 'Növbəti dövrə ',
                dueLabel: 'İcrası bu dövrdə tamamlanmalı',
                nextLabel: 'Növbəti dövrə tamamlanan olmalıdır'
            };
        }
        return {
            empty: 'Bu həftə ərzində icra olunan tapşırıq qeydə alınmayıb.',
            during: 'Bu həftə ərzində ümumilikdə ',
            thisPeriod: 'bu həftə',
            overdueEmpty: 'Bu həftə bitməli olub, lakin tamamlanmayan tapşırıq yoxdur.',
            overduePrefix: 'Bu həftə bitməli olub, lakin tamamlanmayan ',
            nextEmpty: 'Növbəti həftəyə keçid edəcək tapşırıq yoxdur.',
            nextPrefix: 'Növbəti həftəyə ',
            dueLabel: 'İcrası bu həftə tamamlanmalı',
            nextLabel: 'Növbəti həftəyə tamamlanan olmalıdır'
        };
    }

    function buildIcmalSummaryText(kpis, isMonth) {
        var w = icmalPeriodCopy(isMonth);
        var parts = [];
        if (kpis.total === 0) {
            parts.push(w.empty);
        } else {
            var doneClause = '';
            if (kpis.done === 0) {
                doneClause = 'onlardan heç biri tamamlanmayıb';
            } else if (kpis.doneInPeriod === 0) {
                doneClause = 'onlardan ' + kpis.done + ' tapşırıq tamamlanıb';
            } else {
                doneClause = 'onlardan ' + kpis.done + ' tapşırıq tamamlanıb (bunlardan ' + kpis.doneInPeriod + '-i məhz ' + w.thisPeriod + ' olanlardır)';
            }
            parts.push(w.during + kpis.total + ' tapşırıq üzərində iş aparılıb, ' + doneClause + '.');
        }
        if (kpis.notDoneDue === 0) {
            parts.push(w.overdueEmpty);
        } else {
            parts.push(w.overduePrefix + kpis.notDoneDue + ' tapşırıq var.');
        }
        if (kpis.blocked === 0 && kpis.rejected === 0) {
            parts.push('Hazırda çətinlik mövcud deyil və imtina edilən tapşırıq yoxdur.');
        } else if (kpis.blocked === 0) {
            parts.push('Hazırda çətinlik mövcud deyil, ' + kpis.rejected + ' tapşırıqdan isə imtina edilib.');
        } else if (kpis.rejected === 0) {
            parts.push('Hazırda ' + kpis.blocked + ' tapşırıq üzrə çətinlik mövcuddur, imtina edilən tapşırıq isə yoxdur.');
        } else {
            parts.push('Hazırda ' + kpis.blocked + ' tapşırıq üzrə çətinlik mövcuddur, ' + kpis.rejected + ' tapşırıqdan isə imtina edilib.');
        }
        if (kpis.carryover === 0) {
            parts.push(w.nextEmpty);
        } else {
            parts.push(w.nextPrefix + kpis.carryover + ' tapşırıq keçid edəcək.');
        }
        return parts.join(' ');
    }

    function statCell(numberText, labelText, isLast, fontName) {
        fontName = fontName || REPORT_FONT;
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
                    children: [new TextRun({ text: String(numberText), bold: true, font: fontName, size: FONT_SIZE, color: COL_INK })] }),
                new Paragraph({ alignment: AlignmentType.LEFT, spacing: { after: 0 },
                    children: [new TextRun({ text: labelText, font: fontName, size: FONT_SMALL, color: COL_MUTED })] })
            ]
        });
    }

    function appendIcmalAndStats(target, kpis, isMonth, fontName) {
        fontName = fontName || REPORT_FONT;
        var w = icmalPeriodCopy(isMonth);
        var summaryText = buildIcmalSummaryText(kpis, isMonth);
        target.push(new Table({
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
                        new Paragraph({ spacing: { after: 80 }, children: [new TextRun({ text: 'HESABATIN İCMALI', bold: true, font: fontName, size: FONT_SMALL, color: COL_MUTED })] }),
                        new Paragraph({ spacing: { after: 0, line: 300 }, children: [new TextRun({ text: summaryText, font: fontName, size: FONT_SIZE, color: COL_BODY })] })
                    ]
                })
            ] }) ]
        }));
        target.push(new Paragraph({ text: '', spacing: { after: 200 } }));
        target.push(new Table({
            width: { size: 100, type: WidthType.PERCENTAGE },
            rows: [ new TableRow({ children: [
                statCell(kpis.dueDisplay || kpis.due, w.dueLabel, false, fontName),
                statCell(kpis.blocked, 'Mövcud çətinliklər', false, fontName),
                statCell(kpis.done, 'Ümumi tamamlanan tapşırıq sayı', false, fontName),
                statCell(kpis.planned, w.nextLabel, true, fontName)
            ] }) ]
        }));
        target.push(new Paragraph({ text: '', spacing: { after: 200 } }));
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
        var unique = uniquePhaseEntries(allDated);
        if (restrictToPeriod) {
            return unique.filter(function(e) {
                return e && e.date && isDateInReportPeriod(e.date, periodStart, periodEnd);
            });
        }
        return selectPhasesForReport(unique, periodStart, periodEnd);
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

    function collectWeekPhaseLines(t, childIssues, periodStart, periodEnd) {
        var lines = [];
        var seen = {};
        var info = { start: periodStart, end: periodEnd };
        function addIssue(issue) {
            if (!issue) return;
            var entries = issueMonthPhaseEntries(issue, info);
            (entries || []).forEach(function(entry) {
                var line = formatEntryLine(entry);
                if (!line) return;
                var key = (issue.key || '') + '|' + normalizeStr(line);
                if (seen[key]) return;
                seen[key] = true;
                lines.push(line);
            });
        }
        addIssue(t);
        (childIssues || []).forEach(addIssue);
        return lines;
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

    function buildSection(tasks, isProblemSection, periodStart, periodEnd, filterFn, restrictToPeriod, skipIfNoPhases) {
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

                if (restrictToPeriod) {
                    collectWeekPhaseLines(t, childIssues, periodStart, periodEnd).forEach(function(line) {
                        childLines.push(line);
                    });
                    if (isProblemSection) {
                        childIssues.forEach(function(subIssue) {
                            appendProblemReason(childLines, subIssue);
                        });
                    }
                    if (skipIfNoPhases && childLines.length === 0) return;
                } else {
                    if (isProblemSection) appendProblemReason(childLines, t);
                    var groupIssues = phaseIssuesForGroup(t, childIssues, isOwnDone, restrictToPeriod, filterFn);
                    appendEntryLines(childLines, groupPhaseEntries(t, groupIssues, periodStart, periodEnd, restrictToPeriod));
                    groupIssues.forEach(function(subIssue) {
                        if (subIssue.key === t.key) return;
                        if (hasPhaseText(subIssue)) return;
                        if (getIssueFallbackDate(subIssue)) return;
                        if (isProblemSection && issueMatches(subIssue, filterFn)) appendProblemReason(childLines, subIssue);
                        var name = (subIssue.fields && subIssue.fields.summary) ? subIssue.fields.summary : subIssue.key;
                        if (name) childLines.push(name.endsWith('.') ? name : name + '.');
                    });
                    childIssues.forEach(function(subIssue) {
                        if (isProblemSection && issueMatches(subIssue, filterFn) && hasPhaseText(subIssue)) {
                            appendProblemReason(childLines, subIssue);
                        }
                    });
                    if (childLines.length === 0 && !isOwnDone) return;
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
        var name = (info && info.fileMonth) || 'Aylıq';
        if (info && info.months && info.months.length) name = info.months[0].fileMonth;
        return name + ' ayı hesabatı.docx';
    }

    function monthlyDownloadToast(infos) {
        var names = (infos || []).map(function(info) { return info.fileMonth; }).filter(Boolean);
        if (!names.length) return 'Aylıq hesabat (.docx) uğurla yükləndi!';
        if (names.length === 1) return names[0] + ' ayı hesabatı (.docx) uğurla yükləndi!';
        return joinAzNames(names) + ' aylıq hesabatları yükləndi.';
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
            if (toastMsg) showToast(toastMsg, 'success');
            return true;
        } catch (err) {
            console.error(err);
            showToast('Hesabat yaradılarkən xəta baş verdi: ' + err.message, 'error');
            return false;
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
            if (!sameQurum(q, state.currentQurumFilter)) return false;
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
        var raw = getRawPhaseEntries(t, start, end);
        return raw.length > 0;
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
        (state.filteredTasks || []).forEach(function(t) {
            if (taskHasMonthActivity(t, info.start, info.end)) add(t);
        });
        (state.allTasks || []).forEach(function(t) {
            if (taskHasMonthActivity(t, info.start, info.end)) add(t);
        });
        return out;
    }

    function issueBelongsToSprint(t, sprintName) {
        if (!t || !sprintName) return false;
        if (getSprintNames(t).indexOf(sprintName) !== -1) return true;
        if (isSubtaskType(t)) {
            var parent = getParentIssue(t);
            if (parent && getSprintNames(parent).indexOf(sprintName) !== -1) return true;
        }
        return false;
    }

    function collectSprintSource(sprintName) {
        var seen = {};
        var out = [];
        function add(t) {
            if (!t || !t.key || seen[t.key] || isPausedTask(t)) return;
            if (!isTaskOrSubtaskType(t)) return;
            if (!matchesReportSideFilters(t)) return;
            var st = t.fields && t.fields.status ? normalizeStr(t.fields.status.name) : '';
            if (st.includes('başlanmamış') || st.includes('baslanmamis')) return;
            seen[t.key] = true;
            out.push(t);
        }
        (state.allTasks || []).forEach(function(t) {
            if (!issueBelongsToSprint(t, sprintName)) return;
            add(t);
            if (isTaskType(t)) {
                collectChildIssues(t).forEach(function(child) {
                    if (isSubtaskType(child) || isTaskOrSubtaskType(child)) add(child);
                });
            }
        });
        return out;
    }

    function phaseFieldIndex(entry) {
        var n = PHASE_FIELDS.length;
        var i = entry && typeof entry.fieldIndex === 'number' ? entry.fieldIndex : -1;
        if (i >= 0 && i < n) return i;
        return 0;
    }

    function uniqueMonthlyPhaseEntries(entries) {
        var byKey = {};
        (entries || []).forEach(function(e) {
            if (!e || !e.text) return;
            var body = normalizeStr(String(e.text).replace(/^\d{1,2}[./]\d{1,2}[./]\d{4}(?:\s*tarixində)?\s*/i, '').replace(/[.]+$/, ''));
            if (!body) return;
            var fi = phaseFieldIndex(e);
            var day = e.date ? formatDateObj(e.date) : '';
            var key = fi + '|' + day + '|' + body;
            var prev = byKey[key];
            if (!prev) {
                byKey[key] = e;
                return;
            }
            var prevTime = prev.date ? prev.date.getTime() : 0;
            var nextTime = e.date ? e.date.getTime() : 0;
            if (nextTime >= prevTime) byKey[key] = e;
        });
        return Object.keys(byKey).map(function(k) { return byKey[k]; });
    }

    function expandPhaseEntry(e) {
        if (!e || !e.text) return [];
        var parts = parsePhaseEntriesFromText(e.text, e.date);
        if (!parts.length) return [e];
        return parts.map(function(p) {
            return {
                date: p.date || e.date,
                text: p.text,
                fieldIndex: e.fieldIndex
            };
        });
    }

    function issueMonthPhaseEntries(t, info) {
        if (!t || !info) return [];
        var collected = (getDatedPhaseEntries(t) || []).concat(getRawPhaseEntries(t, info.start, info.end) || []);
        var expanded = [];
        collected.forEach(function(e) {
            expandPhaseEntry(e).forEach(function(p) { expanded.push(p); });
        });
        var inPeriod = uniqueMonthlyPhaseEntries(expanded).filter(function(entry) {
            return entry && entry.date && isDateInReportPeriod(entry.date, info.start, info.end);
        });
        inPeriod.sort(function(a, b) {
            var da = a.date ? a.date.getTime() : 0;
            var db = b.date ? b.date.getTime() : 0;
            if (da !== db) return da - db;
            return phaseFieldIndex(a) - phaseFieldIndex(b);
        });
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

    function isWeakQurumLabel(label, t) {
        if (!label) return true;
        var s = String(label).trim();
        if (!s || s === '—' || s === '-') return true;
        if (t && t.key && s === t.key) return true;
        return false;
    }

    function resolvePhaseQurum(t) {
        var cur = t;
        var depth = 0;
        while (cur && depth < 10) {
            var q = getQurumName(cur);
            if (q && String(q).trim()) return String(q).trim();
            cur = getParentIssue(cur);
            depth++;
        }
        var parent = getParentIssue(t);
        var parentSum = parent && parent.fields && parent.fields.summary ? String(parent.fields.summary).trim() : '';
        var assessed = getAssessmentQurumLabel(t);
        if (!isWeakQurumLabel(assessed, t)) {
            var dir = resolveDirection(t);
            var dirName = dir && dir.fields && dir.fields.summary ? String(dir.fields.summary).trim() : '';
            if (dirName && normalizeStr(assessed) === normalizeStr(dirName) && parentSum && normalizeStr(parentSum) !== normalizeStr(dirName)) {
                return parentSum;
            }
            return String(assessed).trim();
        }
        if (parentSum) return parentSum;
        var own = taskSummary(t);
        if (own) return own;
        return (t && t.key) || 'Qurum təyin edilməyib';
    }

    function textHasQurum(text, qurum) {
        if (!qurum || !text) return false;
        var needle = normalizeStr(qurum);
        return !!(needle && normalizeStr(text).indexOf(needle) !== -1);
    }

    function withQurumOnTitle(name, qurum) {
        if (!name) return name;
        if (!qurum || textHasQurum(name, qurum)) return name;
        return qurum + ' — ' + name;
    }

    function formatMonthlyEntryLine(entry) {
        return formatEntryLine(entry);
    }

    function collectMonthlyWorkUnits(dirTasks, info, allowedKeys) {
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
                kids.forEach(walk);
            }
            if (allowedKeys && !allowedKeys[t.key]) return;
            var entries = issueMonthPhaseEntries(t, info);
            if (entries.length === 0) return;
            var qurum = resolvePhaseQurum(t);
            units.push({
                task: t,
                qurum: qurum,
                entries: entries.map(function(e) {
                    var copy = Object.assign({}, e);
                    if (!copy.qurum) copy.qurum = qurum;
                    return copy;
                })
            });
        }
        (dirTasks || []).forEach(walk);
        units.sort(function(a, b) {
            var na = (a.entries || []).length;
            var nb = (b.entries || []).length;
            if (na !== nb) return na - nb;
            var ia = a.entries && a.entries[0] ? phaseFieldIndex(a.entries[0]) : 0;
            var ib = b.entries && b.entries[0] ? phaseFieldIndex(b.entries[0]) : 0;
            if (ia !== ib) return ia - ib;
            var da = a.entries[0] && a.entries[0].date ? a.entries[0].date.getTime() : 0;
            var db = b.entries[0] && b.entries[0].date ? b.entries[0].date.getTime() : 0;
            if (da !== db) return da - db;
            return taskSummary(a.task).localeCompare(taskSummary(b.task), 'az');
        });
        return units;
    }

    function uniquePhaseLines(entries) {
        var lines = [];
        var seen = {};
        (entries || []).forEach(function(entry) {
            var line = formatMonthlyEntryLine(entry);
            if (!line) return;
            var lk = normalizeStr(line);
            if (!lk || seen[lk]) return;
            seen[lk] = true;
            lines.push(line);
        });
        return lines;
    }

    function groupMonthlyUnits(units, byQurumOnly) {
        var groups = {};
        var order = [];
        (units || []).forEach(function(row) {
            var t = row && row.task;
            if (!t) return;
            var qurum = row.qurum || resolvePhaseQurum(t);
            var name = taskSummary(t);
            var key = byQurumOnly
                ? qurumMatchKey(qurum)
                : (qurumMatchKey(qurum) + '|' + normalizeStr(name));
            if (!key) return;
            if (!groups[key]) {
                groups[key] = { qurum: qurum, name: name, tasks: [], entries: [] };
                order.push(key);
            }
            groups[key].tasks.push(t);
            (row.entries || []).forEach(function(e) {
                if (e) groups[key].entries.push(e);
            });
        });
        order.forEach(function(k) {
            groups[k].entries.sort(function(a, b) {
                var da = a.date ? a.date.getTime() : 0;
                var db = b.date ? b.date.getTime() : 0;
                if (da !== db) return da - db;
                return phaseFieldIndex(a) - phaseFieldIndex(b);
            });
            groups[k].lines = uniquePhaseLines(groups[k].entries);
        });
        return order.map(function(k) { return groups[k]; }).filter(function(g) {
            return g.lines && g.lines.length;
        });
    }

    function stripEndPunct(s) {
        return String(s || '').replace(/[;.,]+\s*$/, '').trim();
    }

    function officialItemText(group, mode) {
        var head = '';
        if (mode === 'qurum') {
            head = (group.qurum || group.name || '').trim();
        } else {
            var title = (group.name || '').trim();
            if (group.qurum && title && !textHasQurum(title, group.qurum)) {
                head = group.qurum + ' — ' + title;
            } else if (title) {
                head = title;
            } else {
                head = (group.qurum || '').trim();
            }
        }
        var body = (group.lines || []).join(' ');
        if (head && body) return head + '. ' + body;
        if (body) return body;
        return head;
    }

    function appendOfficialList(monthChildren, texts, fontName) {
        var items = (texts || []).map(stripEndPunct).filter(Boolean);
        items.forEach(function(item, idx) {
            var line = item + (idx === items.length - 1 ? '.' : ';');
            monthChildren.push(bodyParagraph(line, fontName));
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

    function isMetodikiTask(t) {
        var s = normalizeStr(taskSummary(t));
        return s.indexOf('metodiki') !== -1 || s.indexOf('metodoloji') !== -1 || s.indexOf('şablon') !== -1 || s.indexOf('sablon') !== -1;
    }

    function unitIsDone(row) {
        var t = row && row.task;
        if (!t || !t.fields || !t.fields.status) return false;
        return getStatusGroup(t.fields.status.name) === 'done';
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

    function sectionHeadingParagraph(text, fontName) {
        return new Paragraph({
            spacing: { before: 280, after: 120 },
            children: [new TextRun({ text: text, bold: true, font: fontName, size: 24, color: COL_INK })]
        });
    }

    function filterMonthlyUnits(units, pred) {
        return (units || []).filter(function(row) {
            return row && row.task && pred(row.task, row);
        });
    }

    function buildMonthlyDocument(info, opts) {
        opts = opts || {};
        var kind = opts.kind || 'month';
        var sourceMode = opts.sourceMode || 'date';
        var sprintName = opts.sprintName || info.sprintName || '';
        var MONTH_FONT = 'Times New Roman';
        var periodPhrase = kind === 'month'
            ? monthlyPeriodPhrase(info)
            : (formatDateObj(info.start) + ' – ' + formatDateObj(info.end) + ' tarixləri');
        var titleLine;
        if (kind === 'week') titleLine = 'Həftəlik İcra Hesabatı';
        else if (kind === 'period') titleLine = 'İcra Hesabatı';
        else titleLine = periodPhrase + ' üzrə fəaliyyətinə dair hesabat';
        var monthSource = sourceMode === 'sprint'
            ? collectSprintSource(sprintName)
            : collectMonthlySource(info);
        var allowedKeys = null;
        if (sourceMode === 'sprint') {
            allowedKeys = {};
            (monthSource || []).forEach(function(t) {
                if (t && t.key) allowedKeys[t.key] = true;
            });
        }
        var allParents = getPrintTasks(function() { return true; }, monthSource);
        var seenParent = {};
        var uniqueParents = [];
        allParents.forEach(function(t) {
            if (!t || !t.key || seenParent[t.key]) return;
            seenParent[t.key] = true;
            uniqueParents.push(t);
        });

        var buckets = {};
        CANON_ORDER.forEach(function(id) { buckets[id] = []; });
        var seenBucket = {};
        function addToBucket(t) {
            if (!t || !t.key || seenBucket[t.key] || isPausedTask(t)) return;
            seenBucket[t.key] = true;
            var dir = resolveDirection(t);
            var name = dir ? (dir.fields.summary || 'DİGƏR İSTİQAMƏTLƏR').trim() : 'DİGƏR İSTİQAMƏTLƏR';
            var id = canonicalSectionId(name);
            buckets[id].push(t);
        }
        uniqueParents.forEach(addToBucket);
        (monthSource || []).forEach(addToBucket);
        if (sourceMode !== 'sprint') {
            (state.allTasks || []).forEach(function(t) {
                var dir = resolveDirection(t);
                var name = dir ? (dir.fields.summary || '').trim() : '';
                if (name && (isReyestrDirection(name) || isMaqsadDirection(name))) addToBucket(t);
            });
        }

        var unitsByCanon = {};
        CANON_ORDER.forEach(function(id) {
            unitsByCanon[id] = collectMonthlyWorkUnits(buckets[id] || [], info, allowedKeys);
        });

        var monthChildren = [];
        var TEDBIRLER_PLANI = 'Reyestrin inkişafı məqsədilə hazırlanmış Tədbirlər Planının icra vəziyyətinin müzakirəsi məqsədilə aidiyyəti əməkdaşlarla gündəlik görüşlər keçirilmiş və aşağıdakı bölmələr üzrə yoxlamalar aparılmışdır:';

        monthChildren.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 80 },
            children: [new TextRun({ text: 'Qiymətləndirmə və komplayens şöbəsinin', bold: true, font: MONTH_FONT, size: 28, color: COL_INK })]
        }));
        if (kind === 'week' || kind === 'period') {
            monthChildren.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 80 },
                children: [new TextRun({ text: titleLine, bold: true, font: MONTH_FONT, size: 28, color: COL_INK })]
            }));
            var weekSub = formatDateObj(info.start) + ' – ' + formatDateObj(info.end);
            if (sprintName) weekSub += '  ·  ' + sprintName;
            monthChildren.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 360 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COL_INK, space: 12 } },
                children: [new TextRun({ text: weekSub, font: MONTH_FONT, size: 22, color: COL_MUTED })]
            }));
        } else {
            monthChildren.push(new Paragraph({
                alignment: AlignmentType.CENTER,
                spacing: { after: 360 },
                border: { bottom: { style: BorderStyle.SINGLE, size: 12, color: COL_INK, space: 12 } },
                children: [new TextRun({ text: titleLine, bold: true, font: MONTH_FONT, size: 28, color: COL_INK })]
            }));
        }

        var icmalMode = opts.icmalMode || (kind === 'month' ? 'month' : (kind === 'period' ? 'period' : 'week'));
        var monthKpis;
        if (kind === 'week' && !opts.splitWeekKpis) {
            monthKpis = collectVisibleDashboardKpis();
        } else if (kind === 'period') {
            monthKpis = collectVisibleDashboardKpis();
        } else if (kind === 'month') {
            var kpiUnits = (reportUnits || []).filter(function(t) {
                return taskBelongsToDateRange(t, info.start, info.end);
            });
            monthKpis = collectDashboardKpis(kpiUnits, function(t) {
                return isDueInDateRange(t, info.start, info.end);
            });
        } else {
            var weekUnits = countableWorkUnits((state.filteredTasks || []).filter(function(t) {
                return taskBelongsToDateRange(t, info.start, info.end);
            }));
            monthKpis = collectDashboardKpis(weekUnits, function(t) {
                return isDueInDateRange(t, info.start, info.end);
            });
        }
        appendIcmalAndStats(monthChildren, monthKpis, icmalMode, MONTH_FONT);

        var anySection = false;

        function emitSectionTitle(id) {
            monthChildren.push(sectionHeadingParagraph(CANON_TITLES[id], MONTH_FONT));
            var intro = monthlyIntroForCanon(id, periodPhrase);
            if (intro) monthChildren.push(bodyParagraph(intro, MONTH_FONT));
            anySection = true;
        }

        function emitGrouped(id, units, byQurumOnly) {
            var groups = groupMonthlyUnits(units, byQurumOnly);
            if (!groups.length) return false;
            emitSectionTitle(id);
            appendOfficialList(monthChildren, groups.map(function(g) {
                return officialItemText(g, byQurumOnly ? 'qurum' : 'item');
            }), MONTH_FONT);
            return true;
        }

        var reyestrTasks = buckets.reyestr || [];
        var reyestrUnits = unitsByCanon.reyestr || [];
        var systems = collectRegisteredSystems(reyestrTasks, info);
        var reyestrPlanUnits = filterMonthlyUnits(reyestrUnits, function(t) {
            if (isSystemRegistrationTask(t) && wasRegisteredInMonth(t, info)) return false;
            return !isReyestrProcessTask(t);
        });
        if (systems.length || reyestrPlanUnits.length) {
            monthChildren.push(sectionHeadingParagraph(CANON_TITLES.reyestr, MONTH_FONT));
            anySection = true;
            if (systems.length) {
                monthChildren.push(bodyParagraph(monthlyIntroForCanon('reyestr', periodPhrase), MONTH_FONT));
                systems.forEach(function(name, idx) {
                    var line = formatRegistryItem(name, idx === systems.length - 1);
                    if (line) monthChildren.push(bodyParagraph(line, MONTH_FONT));
                });
            }
            monthChildren.push(bodyParagraph(TEDBIRLER_PLANI, MONTH_FONT));
            var planGroups = groupMonthlyUnits(reyestrPlanUnits, false);
            if (planGroups.length) {
                appendOfficialList(monthChildren, planGroups.map(function(g) {
                    return officialItemText(g, 'item');
                }), MONTH_FONT);
            }
        }

        var meqsedUnits = unitsByCanon.meqsed || [];
        var meqsedProcess = filterMonthlyUnits(meqsedUnits, function(t) { return isReyestrProcessTask(t); });
        var meqsedMain = filterMonthlyUnits(meqsedUnits, function(t) {
            return !isReyestrProcessTask(t);
        });
        var meqsedMetodiki = filterMonthlyUnits(meqsedMain, function(t) { return isMetodikiTask(t); });
        var meqsedRest = filterMonthlyUnits(meqsedMain, function(t) { return !isMetodikiTask(t); });
        var meqsedDone = filterMonthlyUnits(meqsedRest, function(t, row) { return unitIsDone(row); });
        var meqsedOpen = filterMonthlyUnits(meqsedRest, function(t, row) { return !unitIsDone(row); });
        if (meqsedDone.length || meqsedOpen.length || meqsedMetodiki.length || meqsedProcess.length) {
            emitSectionTitle('meqsed');
            if (meqsedDone.length) {
                appendOfficialList(monthChildren, groupMonthlyUnits(meqsedDone, false).map(function(g) {
                    return officialItemText(g, 'item');
                }), MONTH_FONT);
            }
            if (meqsedOpen.length) {
                monthChildren.push(bodyParagraph('Aşağıdakı müraciətlər isə Elektron Sənəd Dövriyyəsi sistemi vasitəsilə rəsmi daxil olmuşdur və təhlil mərhələsindədir:', MONTH_FONT));
                appendOfficialList(monthChildren, groupMonthlyUnits(meqsedOpen, false).map(function(g) {
                    return officialItemText(g, 'item');
                }), MONTH_FONT);
            }
            if (meqsedMetodiki.length) {
                monthChildren.push(bodyParagraph('Eyni zamanda, aşağıdakı qurumlara məqsədəuyğunluq rəyinin verilməsi ilə bağlı işçi qaydada görüşlər keçirilmiş və müvafiq metodiki dəstək göstərilmişdir:', MONTH_FONT));
                var seenQurum = {};
                var qurumNames = [];
                groupMonthlyUnits(meqsedMetodiki, true).forEach(function(g) {
                    var q = (g.qurum || '').trim();
                    var k = normalizeStr(q);
                    if (!k || seenQurum[k]) return;
                    seenQurum[k] = true;
                    qurumNames.push(q);
                });
                appendOfficialList(monthChildren, qurumNames, MONTH_FONT);
            }
            if (meqsedProcess.length) {
                appendOfficialList(monthChildren, groupMonthlyUnits(meqsedProcess, false).map(function(g) {
                    return officialItemText(g, 'item');
                }), MONTH_FONT);
            }
        }

        emitGrouped('diag', unitsByCanon.diag, true);
        emitGrouped('isq', unitsByCanon.isq, true);
        emitGrouped('exq', unitsByCanon.exq, true);
        emitGrouped('inteqrasiya', unitsByCanon.inteqrasiya, false);
        emitGrouped('diger', unitsByCanon.diger, false);

        if (!anySection) {
            monthChildren.push(new Paragraph({
                spacing: { before: 200 },
                children: [new TextRun({ text: periodPhrase + ' üzrə qeydə alınmış fəaliyyət tapılmadı.', font: MONTH_FONT, size: 22, color: COL_BODY })]
            }));
        }

        return new Document({
            sections: [{
                properties: {
                    page: { margin: { top: 1134, right: 1134, bottom: 1134, left: 1134 } }
                },
                headers: {
                    default: new Header({ children: [new Paragraph({ children: [] })] })
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

    function buildWeeklyDocument(info, opts) {
        opts = opts || {};
        var sprintName = opts.sprintName || info.sprintName || '';
        var pStart = info.start;
        var pEnd = info.end;
        var periodLabel = formatDateObj(pStart) + ' – ' + formatDateObj(pEnd);
        if (sprintName) periodLabel += '  ·  ' + sprintName;
        var dueFn = function(t) { return isDueInDateRange(t, pStart, pEnd); };
        var source = state.filteredTasks || [];
        var weekKpis = (opts.splitWeekKpis || opts.icmalMode === 'period')
            ? collectDashboardKpis(countableWorkUnits(source.filter(function(t) {
                return taskBelongsToDateRange(t, pStart, pEnd);
            })), dueFn)
            : collectVisibleDashboardKpis();

        function sectionHeading(num, t, desc) {
            var out = [new Paragraph({
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

        var weekSource = state.filteredTasks || [];

        function appendWeeklySection(headingNodes, sectionNodes, emptyText) {
            children.push.apply(children, headingNodes);
            if (!sectionNodes || sectionNodes.length === 0) {
                children.push(new Paragraph({
                    spacing: { before: 80, after: 120 },
                    children: [new TextRun({ text: emptyText, font: REPORT_FONT, size: FONT_SIZE, color: COL_MUTED })]
                }));
            } else {
                children.push.apply(children, sectionNodes);
            }
            children.push(new Paragraph({ spacing: { before: 80, after: 40 }, children: [] }));
        }

        var children = [];
        children.push(new Paragraph({
            alignment: AlignmentType.CENTER,
            spacing: { after: 20 },
            children: [new TextRun({ text: 'Qiymətləndirmə və komplayens şöbəsinin', font: REPORT_FONT, size: FONT_SMALL, color: COL_MUTED })]
        }));
        children.push(new Paragraph({
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
            children: [new TextRun({ text: 'Əhatə olunan dövr  ·  ' + periodLabel, font: REPORT_FONT, size: FONT_SIZE, color: COL_MUTED })]
        }));

        appendIcmalAndStats(children, weekKpis, opts.icmalMode || 'week', REPORT_FONT);

        var isDoneFn = function(t) { return getStatusGroup(t.fields.status.name) === 'done'; };
        var isNotDoneDueFn = function(t) {
            var g = getStatusGroup(t.fields.status.name);
            return g !== 'done' && g !== 'rejected' && dueFn(t);
        };
        var isProgressFn = function(t) {
            var g = getStatusGroup(t.fields.status.name);
            return (isActiveExecutionGroup(g) || g === 'other') && !dueFn(t);
        };
        var isProblemFn = function(t) {
            var g = getStatusGroup(t.fields.status.name);
            return g === 'blocked' || g === 'rejected' || hasDiffDash(t);
        };
        var isPlannedFn = function(t) { return getStatusGroup(t.fields.status.name) === 'planned'; };

        appendWeeklySection(
            sectionHeading('1', 'Görülən işlər', 'Hesabat dövründə yekunlaşdırılmış işlər istiqamətlər üzrə.'),
            buildSection(getPrintTasks(isDoneFn, weekSource), false, pStart, pEnd, isDoneFn, true, true),
            'Bu həftə tamamlanmış iş qeydə alınmayıb.'
        );
        appendWeeklySection(
            sectionHeading('2', 'Nəyi edə bilmədik', 'Bu həftə son icra müddəti (deadline) olan, lakin tamamlanmamış tapşırıqlar.'),
            buildSection(getPrintTasks(isNotDoneDueFn, weekSource), false, pStart, pEnd, isNotDoneDueFn, true, false),
            'Bu həftə bitməli olub, lakin tamamlanmayan tapşırıq yoxdur.'
        );
        appendWeeklySection(
            sectionHeading('3', 'İcra mərhələsində olan və yarımçıq qalanlar', 'Planlaşdırılmış, lakin hələ də icra mərhələsində olan işlər.'),
            buildSection(getPrintTasks(isProgressFn, weekSource), false, pStart, pEnd, isProgressFn, true, true),
            'İcra mərhələsində yarımçıq qalan tapşırıq yoxdur.'
        );
        appendWeeklySection(
            sectionHeading('4', 'Mövcud çətinliklər', 'İcra prosesində qarşılaşılan çətinliklər, bloklanan və imtina edilmiş işlər.'),
            buildSection(getPrintTasks(isProblemFn, weekSource), true, pStart, pEnd, isProblemFn, true, false),
            'Bu həftə mövcud çətinlik yaşanmamışdır.'
        );
        appendWeeklySection(
            sectionHeading('5', 'Gələn həftə ərzində planlaşdırılanlar', 'Növbəti həftə üçün əsas iş istiqamətləri və tapşırıqlar.'),
            buildSection(getPrintTasks(isPlannedFn, weekSource), false, pStart, pEnd, isPlannedFn, true, false),
            'Növbəti həftəyə planlaşdırılan tapşırıq yoxdur.'
        );

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
                                children: [
                                    new TextRun({ text: 'Həftəlik İcra Hesabatı', font: REPORT_FONT, size: FONT_SMALL, color: COL_MUTED }),
                                    new TextRun({ text: '   ·   ' + periodLabel, font: REPORT_FONT, size: FONT_SMALL, color: COL_MUTED })
                                ]
                            })
                        ]
                    })
                },
                footers: {
                    default: new Footer({
                        children: [
                            new Paragraph({
                                border: { top: { style: BorderStyle.SINGLE, size: 6, color: COL_LINE, space: 8 } },
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
    }

    var monthInfo = getMonthRangeInfo(startDate, endDate);
    if (monthInfo) {
        var covered = (monthInfo.months && monthInfo.months.length) ? monthInfo.months : [monthInfo];
        var downloaded = [];
        var failed = false;
        for (var mi = 0; mi < covered.length; mi++) {
            var one = monthInfoForCovered(covered[mi]);
            if (!one) continue;
            var ok = await downloadGeneratedDoc(buildMonthlyDocument(one), monthlyFileName(one));
            if (!ok) {
                failed = true;
                break;
            }
            downloaded.push(one);
            if (mi < covered.length - 1) await delayMs(600);
        }
        if (!failed && downloaded.length) {
            showToast(monthlyDownloadToast(downloaded), 'success');
        }
        return;
    }

    var sprintWeekly = getSprintWeeklyExport();
    if (sprintWeekly) {
        var sprintOk = await downloadGeneratedDoc(
            buildWeeklyDocument(sprintWeekly.info, sprintWeekly.opts),
            weeklyFileName(sprintWeekly.info)
        );
        if (sprintOk) showToast(weeklyDownloadToast([sprintWeekly.info]), 'success');
        return;
    }

    var weekRange = getWeekRangeInfo(startDate, endDate);
    if (weekRange && weekRange.weeks && weekRange.weeks.length) {
        var weekDownloaded = [];
        var weekFailed = false;
        for (var wi = 0; wi < weekRange.weeks.length; wi++) {
            var weekOne = weekRange.weeks[wi];
            var weekOk = await downloadGeneratedDoc(
                buildWeeklyDocument(weekOne, {
                    kind: 'week',
                    icmalMode: 'week',
                    splitWeekKpis: weekRange.weeks.length > 1
                }),
                weeklyFileName(weekOne)
            );
            if (!weekOk) {
                weekFailed = true;
                break;
            }
            weekDownloaded.push(weekOne);
            if (wi < weekRange.weeks.length - 1) await delayMs(600);
        }
        if (!weekFailed && weekDownloaded.length) {
            showToast(weeklyDownloadToast(weekDownloaded), 'success');
        }
        return;
    }

    if (periodStart && periodEnd) {
        var periodInfo = weekInfoFromDates(periodStart, periodEnd);
        var periodOk = await downloadGeneratedDoc(
            buildWeeklyDocument(periodInfo, { kind: 'period', icmalMode: 'period' }),
            'Hesabat ' + formatDateObj(periodInfo.start).slice(0, 5) + '-' + formatDateObj(periodInfo.end) + '.docx'
        );
        if (periodOk) showToast('Hesabat (.docx) uğurla yükləndi!', 'success');
        return;
    }

    showToast('Hesabat üçün sprint və ya tarix aralığı seçin.', 'error');
}
