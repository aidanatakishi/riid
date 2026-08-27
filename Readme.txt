Rəqəmsal İdarəetmə Paneli (Jira Dashboard)
Bu layihə İRİA (Rəqəmsal İdarəetmə Departamenti) üçün Jira məlumatlarını vizual olaraq izləmək məqsədilə yaradılmışdır. Sistem Jira API istifadə edərək taskları, sprintləri, çətinlikləri və qurumları üzrə statistikaları real vaxt rejimində dashboard-da göstərir.

🛠 Texnologiyalar
Backend: Python 3, Flask
Frontend: HTML5, Tailwind CSS, JavaScript (ES6 modules)
Vizualizasiya: Chart.js
Mənbə: Jira REST API (v2)
📁 Layihə Strukturu
Layihə qovluğunda aşağıdakı fayllar olmalıdır:

text

├── app.py                 # Flask giriş nöqtəsi
├── config.py              # Jira URL, PAT, layihə, field ID-ləri
├── jira_client.py         # Jira HTTP sorğuları
├── jql.py                 # Tarix filteri / JQL helper
├── routes.py              # API endpoint-ləri
├── requirements.txt
├── templates/index.html   # Dashboard markup
├── static/css/dashboard.css
└── static/js/
    ├── main.js            # Başlanğıc və window export
    ├── state.js           # Paylaşılan vəziyyət
    ├── utils.js
    ├── model.js           # Issue/istiqamət/sprint helper-ləri
    ├── api.js             # Jira sorğuları (brauzer tokeni)
    ├── filters.js
    ├── charts.js
    ├── render.js
    └── report.js          # Word hesabatı
⚙️ İstifadə Olunan Jira Xüsusi Sahələri (Custom Fields)
Sistem məlumatları Jira-dan aşağıdakı field-lər vasitəsilə çəkir. Əgər Jira-da bu field-lərin ID-ləri dəyişsə, config.py və static/js/model.js içindəki ID-ləri yeniləmək lazımdır:

customfield_10101 - Sprint məlumatları
customfield_12703 - Çətinlik (Mətn/String)
customfield_13608 - Qurumun adı
customfield_12424 - Qurum (Ehtiyat field)
customfield_10015 / 10016 - Target Start / End

🚀 Sistemi İşə Salmaq (Run Etmək)
Addım 1: Python və kitabxanaların qurulması
Komputerinizdə Python 3 quraşdırılmış olmalıdır. Terminalı (və ya CMD-ni) açıb aşağıdakı əmrləri yazın:

bash

pip install -r requirements.txt
Addım 2: Backend serverin başladılması
Layihə qovluğuna terminal vasitəsilə daxil olun və Flask serverini işə salın:

bash

python app.py
Server uğurla başladıqdan sonra terminalda Running on http://127.0.0.1:5000 yazısı görünəcək. Bu pəncərəni açıq saxlayın.

Addım 3: Dashboard-u açmaq
Brauzerinizi (Google Chrome, Edge və s.) açın və ünvan çubuğuna yazın:

text

http://127.0.0.1:5000
Addım 4: Jira tokenini yazmaq
Saytın yuxarısındakı Token düyməsinə basın və öz PAT-inizi yazın. Hər kəs öz tokeni ilə daxil olur.

🔧 Dəyişiklik Edilməsi Üçün Təlimat
1. Yeni qrafik (chart) əlavə etmək istəyirsinizsə:
HTML hissəsində (templates/index.html): <canvas id="yeniChart"></canvas> tag-i əlavə edin.
JS hissəsində (static/js/charts.js): drawChart('yeniChart', 'bar', labels, data, colors, onClickCB) funksiyasını çağıraraq qrafiki çəkin. Görünüş növü olaraq 'bar', 'doughnut', 'line' və s. istifadə edə bilərsiniz.
2. Yeni Jira Field-i (mətni) əlavə etmək istəyirsinizsə:
config.py: SEARCH_FIELDS / HIERARCHY_FIELDS siyahısına yeni customfield_XXXXX əlavə edin.
static/js: t.fields['customfield_XXXXX'] çağıraraq datanı oxuyun və kartlara əlavə edin.
3. Filtrləri (Sprint və Tarix) dəyişdirmək:
Filtr məntiqi static/js/filters.js içindəki applyFilters() funksiyasında yerləşir. state.filteredTasks massivi üzərində .filter() istifadə edərək istənilən şərti əlavə edib taskları süzgəcdən keçirə bilərsiniz.
Qeyd: Server artıq host='0.0.0.0' ilə açılır — eyni ofis şəbəkəsindəki kompüterlər http://SİZİN-IP:5000 ünvanına daxil ola bilər.

🌐 Netlify (statik sayt)
Dashboard statik fayldır. Jira sorğuları brauzerdən gedir — hər kəs yuxarıdakı Token düyməsindən öz PAT-ini yazır. Server-də / Netlify-də token saxlanılmır.

jira.idda.az ofis/VPN daxilindədir. Saytı açan şəxs ofis şəbəkəsində və ya VPN-də olmalıdır; Netlify buludunun Jira-ya çıxışı lazım deyil.

