"""Built-in Azerbaijan state org short↔full name map (curated).

Used to seed/merge into data/chat_kb.json so admins need not type each alias.
"""

# canonical = preferred display; aliases = official/common short forms
BUILTIN_QURUM_ALIASES = [
    {
        'canonical': 'Tibbi Ərazi Bölmələrini İdarəetmə Birliyi publik hüquqi şəxs (TƏBİB)',
        'aliases': [
            'TƏBİB', 'TABIB', 'tabib', 'təbib',
            'Tibbi Ərazi Bölmələrini İdarəetmə Birliyi',
            'tibbi erazi bolmeleri',
        ],
    },
    {
        'canonical': 'Dövlət Miqrasiya Xidməti',
        'aliases': ['DMX', 'miqrasiya', 'miqrasiya xidməti'],
    },
    {
        'canonical': 'Dövlət Gömrük Komitəsi',
        'aliases': ['DGK', 'gömrük', 'gomruk'],
    },
    {
        'canonical': 'Daxili İşlər Nazirliyi',
        'aliases': ['DİN', 'DIN', 'daxili işlər'],
    },
    {
        'canonical': 'Rəqəmsal İnkişaf və Nəqliyyat Nazirliyi',
        'aliases': ['RİNN', 'RINN', 'RİN', 'RIN', 'rəqəmsal inkişaf', 'nəqliyyat nazirliyi'],
    },
    {
        'canonical': 'Əmək və Əhalinin Sosial Müdafiəsi Nazirliyi',
        'aliases': ['ƏƏSMN', 'EESMN', 'ESN', 'əmək nazirliyi', 'sosial müdafiə'],
    },
    {
        'canonical': 'Dövlət Statistika Komitəsi',
        'aliases': ['DSK', 'statistika'],
    },
    {
        'canonical': 'İqtisadiyyat Nazirliyi',
        'aliases': ['İN', 'IN', 'iqtisadiyyat'],
    },
    {
        'canonical': 'Səhiyyə Nazirliyi',
        'aliases': ['SN', 'səhiyyə', 'sehiyye'],
    },
    {
        'canonical': 'Elm və Təhsil Nazirliyi',
        'aliases': ['ETN', 'təhsil nazirliyi', 'elm və təhsil', 'tehsil'],
    },
    {
        'canonical': 'Maliyyə Nazirliyi',
        'aliases': ['MN', 'maliyyə', 'maliyye'],
    },
    {
        'canonical': 'Ədliyyə Nazirliyi',
        'aliases': ['ƏN', 'EN', 'ədliyyə', 'edliyye'],
    },
    {
        'canonical': 'Kənd Təsərrüfatı Nazirliyi',
        'aliases': ['KTN', 'kənd təsərrüfatı', 'kend teserrufati'],
    },
    {
        'canonical': 'Ekologiya və Təbii Sərvətlər Nazirliyi',
        'aliases': ['ETSN', 'ekologiya'],
    },
    {
        'canonical': 'Energetika Nazirliyi',
        'aliases': ['EN', 'energetika'],
    },
    {
        'canonical': 'Mədəniyyət Nazirliyi',
        'aliases': ['MədN', 'mədəniyyət', 'medeniyyet'],
    },
    {
        'canonical': 'Gənclər və İdman Nazirliyi',
        'aliases': ['GİN', 'GIN', 'gənclər', 'idman nazirliyi'],
    },
    {
        'canonical': 'Xarici İşlər Nazirliyi',
        'aliases': ['XİN', 'XIN', 'xarici işlər'],
    },
    {
        'canonical': 'Müdafiə Nazirliyi',
        'aliases': ['MN', 'müdafiə nazirliyi', 'mudafie'],
    },
    {
        'canonical': 'Müdafiə Sənayesi Nazirliyi',
        'aliases': ['MSN', 'müdafiə sənayesi'],
    },
    {
        'canonical': 'Fövqəladə Hallar Nazirliyi',
        'aliases': ['FHN', 'fövqəladə hallar'],
    },
    {
        'canonical': 'Dövlət Vergi Xidməti',
        'aliases': ['DVX', 'vergi', 'vergi xidməti'],
    },
    {
        'canonical': 'Dövlət Əmək Müfəttişliyi Xidməti',
        'aliases': ['DƏMX', 'DEMX', 'əmək müfəttişliyi'],
    },
    {
        'canonical': 'Dövlət Sosial Müdafiə Fondu',
        'aliases': ['DSMF', 'sosial müdafiə fondu'],
    },
    {
        'canonical': 'Dövlət Neft Fondu',
        'aliases': ['DNF', 'neft fondu', 'SOFAZ'],
    },
    {
        'canonical': 'Azərbaycan Respublikasının Prezidentinin Administrasiyası',
        'aliases': ['APA', 'prezident administrasiyası'],
    },
    {
        'canonical': 'Nazirlər Kabineti',
        'aliases': ['NK', 'nazirlər kabineti'],
    },
    {
        'canonical': 'Azərbaycan Respublikasının Milli Məclisi',
        'aliases': ['MM', 'milli məclis'],
    },
    {
        'canonical': 'Konstitusiya Məhkəməsi',
        'aliases': ['KM', 'konstitusiya məhkəməsi'],
    },
    {
        'canonical': 'Ali Məhkəmə',
        'aliases': ['ali məhkəmə'],
    },
    {
        'canonical': 'Baş Prokurorluq',
        'aliases': ['BP', 'prokurorluq'],
    },
    {
        'canonical': 'Dövlət Təhlükəsizliyi Xidməti',
        'aliases': ['DTX', 'təhlükəsizlik xidməti'],
    },
    {
        'canonical': 'Xarici Kəşfiyyat Xidməti',
        'aliases': ['XKX', 'kəşfiyyat'],
    },
    {
        'canonical': 'Dövlət Sərhəd Xidməti',
        'aliases': ['DSX', 'sərhəd xidməti'],
    },
    {
        'canonical': 'Dövlət Miqrasiya Xidməti yanında Vətəndaşlıq Məsələləri Baş İdarəsi',
        'aliases': ['VMBİ', 'vətəndaşlıq'],
    },
    {
        'canonical': 'İcbari Tibbi Sığorta üzrə Dövlət Agentliyi',
        'aliases': ['İTSDA', 'ITSDA', 'icbari tibbi sığorta', 'ITS'],
    },
    {
        'canonical': 'Azərbaycan Respublikasının Mərkəzi Bankı',
        'aliases': ['AMB', 'mərkəzi bank', 'CBAR'],
    },
    {
        'canonical': 'Azərbaycan Dəmir Yolları',
        'aliases': ['ADY', 'dəmir yolları'],
    },
    {
        'canonical': 'Bakı Nəqliyyat Agentliyi',
        'aliases': ['BNA', 'bakı nəqliyyat'],
    },
    {
        'canonical': 'Azərbaycan Avtomobil Yolları Dövlət Agentliyi',
        'aliases': ['AAYDA', 'avtomobil yolları'],
    },
    {
        'canonical': 'Azərbaycan Hava Yolları',
        'aliases': ['AZAL', 'hava yolları'],
    },
    {
        'canonical': 'Azərişıq',
        'aliases': ['Azerishig', 'azərişıq ASC'],
    },
    {
        'canonical': 'Azəriqaz',
        'aliases': ['Azerigaz', 'azəriqaz'],
    },
    {
        'canonical': 'Azərsu',
        'aliases': ['Azersu'],
    },
    {
        'canonical': 'SOCAR',
        'aliases': ['Azərbaycan Respublikası Dövlət Neft Şirkəti', 'neft şirkəti'],
    },
    {
        'canonical': 'Azərbaycan Respublikasının Mədəniyyət Nazirliyi yanında Turizm Agentliyi',
        'aliases': ['turizm agentliyi', 'turizm'],
    },
    {
        'canonical': 'Kiçik və Orta Biznesin İnkişafı Agentliyi',
        'aliases': ['KOBİA', 'KOBIA', 'KOB'],
    },
    {
        'canonical': 'İnovasiya və Rəqəmsal İnkişaf Agentliyi',
        'aliases': ['İRİA', 'IRIA', 'innovasiya agentliyi'],
    },
    {
        'canonical': 'Dövlət Agentliyi (E-Gov / Elektron Hökumət)',
        'aliases': ['e-gov', 'elektron hökumət', 'ASAN'],
    },
    {
        'canonical': 'ASAN xidmət',
        'aliases': ['ASAN', 'Vətəndaşlara Xidmət və Sosial İnnovasiyalar üzrə Dövlət Agentliyi', 'VXSIDA'],
    },
    {
        'canonical': 'Dövlət İmtahan Mərkəzi',
        'aliases': ['DİM', 'DIM', 'imtahan mərkəzi'],
    },
    {
        'canonical': 'Azərbaycan Respublikasının Qida Təhlükəsizliyi Agentliyi',
        'aliases': ['AQTA', 'qida təhlükəsizliyi'],
    },
    {
        'canonical': 'Antiinhisar və İstehlak Bazarına Nəzarət Dövlət Xidməti',
        'aliases': ['antiinhisar', 'istehlak bazarı'],
    },
    {
        'canonical': 'Dövlət Şəhərsalma və Arxitektura Komitəsi',
        'aliases': ['DŞAK', 'şəhərsalma'],
    },
    {
        'canonical': 'Dövlət Şəhərsalma və Arxitektura Agentliyi',
        'aliases': ['şəhərsalma agentliyi'],
    },
    {
        'canonical': 'Ailə, Qadın və Uşaq Problemləri üzrə Dövlət Komitəsi',
        'aliases': ['AQUPDK', 'ailə komitəsi'],
    },
    {
        'canonical': 'Dini Qurumlarla İş üzrə Dövlət Komitəsi',
        'aliases': ['DQİDK', 'dini qurumlar'],
    },
    {
        'canonical': 'Qaçqınların və Məcburi Köçkünlərin İşləri üzrə Dövlət Komitəsi',
        'aliases': ['QMKİDK', 'qaçqınlar komitəsi', 'məcburi köçkünlər'],
    },
    {
        'canonical': 'Dövlət Şəhərsalma və Arxitektura Komitəsi',
        'aliases': ['şəhərsalma komitəsi'],
    },
    {
        'canonical': 'Azərbaycan Respublikası Prezidentinin İşlər İdarəsi',
        'aliases': ['Pİİ', 'işlər idarəsi'],
    },
    {
        'canonical': 'Bakı Şəhər İcra Hakimiyyəti',
        'aliases': ['BŞİH', 'bakı icra'],
    },
    {
        'canonical': 'Sumqayıt Şəhər İcra Hakimiyyəti',
        'aliases': ['sumqayıt icra'],
    },
    {
        'canonical': 'Gəncə Şəhər İcra Hakimiyyəti',
        'aliases': ['gəncə icra'],
    },
    {
        'canonical': 'Naxçıvan Muxtar Respublikası',
        'aliases': ['NMR', 'naxçıvan'],
    },
    {
        'canonical': 'Azərbaycan Respublikasının İnsan Hüquqları üzrə Müvəkkili',
        'aliases': ['Ombudsman', 'ombudsman'],
    },
    {
        'canonical': 'Hesablama Palatası',
        'aliases': ['HP', 'hesablama'],
    },
    {
        'canonical': 'Mərkəzi Seçki Komissiyası',
        'aliases': ['MSK', 'seçki komissiyası'],
    },
    {
        'canonical': 'Azərbaycan Milli Elmlər Akademiyası',
        'aliases': ['AMEA', 'elmlər akademiyası'],
    },
    {
        'canonical': 'Azərbaycan Televiziyası',
        'aliases': ['AzTV', 'aztv'],
    },
    {
        'canonical': 'İctimai Televiziya',
        'aliases': ['İTV', 'ITV'],
    },
]
