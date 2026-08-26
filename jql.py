from config import DATETIME_FIELDS


def normalize_date(d):
    if not d:
        return None
    if isinstance(d, dict):
        y = d.get('year')
        m = d.get('month')
        day = d.get('day')
        if y and m and day:
            return f"{int(y):04d}-{int(m):02d}-{int(day):02d}"
        return None
    if not isinstance(d, str):
        d = str(d)
    d = d.strip()
    if not d:
        return None
    if 'T' in d:
        d = d.split('T')[0]
    elif ' ' in d:
        d = d.split(' ')[0]
    if '/' in d:
        parts = d.split('/')
        if len(parts) == 3:
            if len(parts[2]) == 4:
                d = f"{parts[2]}-{parts[0].zfill(2)}-{parts[1].zfill(2)}"
            elif len(parts[0]) == 4:
                d = f"{parts[0]}-{parts[1].zfill(2)}-{parts[2].zfill(2)}"
    if '.' in d:
        parts = d.split('.')
        if len(parts) == 3 and len(parts[2]) == 4:
            d = f"{parts[2]}-{parts[1].zfill(2)}-{parts[0].zfill(2)}"
    return d


def build_date_filter_jql(date_filter, date_field='duedate'):
    """Tarix filterini JQL şərtinə çevirir və formatı normalizə edir"""
    if not date_filter or not isinstance(date_filter, dict):
        return ""

    start_date = date_filter.get('start') or date_filter.get('startDate') or date_filter.get('from') or date_filter.get('begin')
    end_date = date_filter.get('end') or date_filter.get('endDate') or date_filter.get('to') or date_filter.get('until')

    start_date = normalize_date(start_date)
    end_date = normalize_date(end_date)

    if not start_date and not end_date:
        return ""

    is_datetime = date_field in DATETIME_FIELDS

    conditions = []
    if start_date:
        if is_datetime:
            conditions.append(f'{date_field} >= "{start_date} 00:00"')
        else:
            conditions.append(f'{date_field} >= "{start_date}"')

    if end_date:
        if is_datetime:
            conditions.append(f'{date_field} <= "{end_date} 23:59"')
        else:
            conditions.append(f'{date_field} <= "{end_date}"')

    if not conditions:
        return ""

    return " AND " + " AND ".join(conditions)


def generate_recommendations(results):
    recs = []
    if results["open"] > 0:
        recs.append(f"Açıq issue-lər: {results['open']} - bunlar tarix filterindən asılı olmayaraq görünür")
    if results["done"] > 0:
        recs.append(f"Bağlı issue-lər: {results['done']} - Resolution field-i yoxlayın")
    if results["total"] == 0:
        recs.append("Heç bir issue tapılmadı - Parent key və JQL yoxlayın")
    return recs
