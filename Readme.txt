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
Komputerinizdə Python 3 olmalıdır. Layihə qovluğunda:

  python app.py

və ya Windows-da run.bat-a iki dəfə klik.

İlk dəfə əskik paketlər (flask, openpyxl və s.) avtomatik quraşır — internet lazımdır.
Server uğurla başladıqdan sonra terminalda Running on http://127.0.0.1:5000 yazısı görünəcək. Bu pəncərəni açıq saxlayın.

Dashboard-u açmaq
Brauzerinizi (Google Chrome, Edge və s.) açın və ünvan çubuğuna yazın:

http://127.0.0.1:5000

Giriş
Lokal (run.bat): boş quraşdırmada terminalda admin / admin123 və user / user123 yaranır.
Production: .env-də ADMIN_PASSWORD yazın (ən azı 8 simvol). Login səhifəsində parol göstərilmir.
Yeni hesabları Tənzimləmələr → İstifadəçilər səhifəsindən superadmin/admin yaradır. Tokenlər data/secrets.json-dadır və Git-ə düşmür.

Jira tokeni
Hər istifadəçi öz Jira tokenini (PAT) ilk girişdə yazır. Bir dəfə yadda qalır; növbəti dəfə boş saxlamaq olar. Tokeni Tənzimləmələr səhifəsindən də yeniləmək olur.

🔧 Dəyişiklik Edilməsi Üçün Təlimat
1. Yeni qrafik (chart) əlavə etmək istəyirsinizsə:
HTML hissəsində (templates/index.html): <canvas id="yeniChart"></canvas> tag-i əlavə edin.
JS hissəsində (static/js/charts.js): drawChart('yeniChart', 'bar', labels, data, colors, onClickCB) funksiyasını çağıraraq qrafiki çəkin. Görünüş növü olaraq 'bar', 'doughnut', 'line' və s. istifadə edə bilərsiniz.
2. Yeni Jira Field-i (mətni) əlavə etmək istəyirsinizsə:
config.py: SEARCH_FIELDS / HIERARCHY_FIELDS siyahısına yeni customfield_XXXXX əlavə edin.
static/js: t.fields['customfield_XXXXX'] çağıraraq datanı oxuyun və kartlara əlavə edin.
3. Filtrləri (Sprint və Tarix) dəyişdirmək:
Filtr məntiqi static/js/filters.js içindəki applyFilters() funksiyasında yerləşir. state.filteredTasks massivi üzərində .filter() istifadə edərək istənilən şərti əlavə edib taskları süzgəcdən keçirə bilərsiniz.
Qeyd: Server host='0.0.0.0' ilə açılır — eyni ofis şəbəkəsindəki kompüterlər http://SİZİN-IP:5000 ünvanına daxil ola bilər.

🏭 Production
Prod server Jira-ya (jira.idda.az) çatmalıdır. Netlify canlı Jira yükləyə bilməz.

1. Serverdə .env yazın (.env.example əsasında):
   APP_ENV=production
   FLASK_DEBUG=false
   TRUST_PROXY=true
   SECRET_KEY=...uzun təsadüfi (python -c "import secrets; print(secrets.token_hex(32))")...
   ADMIN_PASSWORD=...yalnız users.json boşdursa, ən azı 8 simvol...
   SESSION_COOKIE_SECURE=false   # HTTPS reverse proxy varsa true
2. Qarşısında HTTPS reverse proxy (IIS / nginx) qoyun. Daxili HTTP-dirsə SESSION_COOKIE_SECURE=false saxlayın.
3. Windows: run-prod.bat  (waitress)
   Linux: gunicorn --preload --bind 0.0.0.0:5000 --workers 2 --timeout 180 app:app
   Docker: docker compose up -d --build
4. data/ və uploads/ qovluqlarını yedəkləyin (hesablar, tokenlər, fayllar).
5. Brauzerdə /api/health  {"ok": true} qaytarmalıdır.
6. Superadmin daxil olub İstifadəçilərdə hesab açır. Hər kəs öz Jira tokenini bir dəfə yazır.

🌐 Netlify (statik sayt)
https://riid.netlify.app menyunu göstərir, amma canlı Jira yükləyə bilməz.
İşləyən yollar:
1. Lokal: run.bat → http://127.0.0.1:5000
2. Production: yuxarıdakı 🏭 bölmə

