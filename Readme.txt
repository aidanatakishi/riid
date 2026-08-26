Rəqəmsal İdarəetmə Paneli (Jira Dashboard)
Bu layihə İRİA (Rəqəmsal İdarəetmə Departamenti) üçün Jira məlumatlarını vizual olaraq izləmək məqsədilə yaradılmışdır. Sistem Jira API istifadə edərək taskları, sprintləri, çətinlikləri və qurumları üzrə statistikaları real vaxt rejimində dashboard-da göstərir.

🛠 Texnologiyalar
Backend: Python 3, Flask
Frontend: HTML5, Tailwind CSS, JavaScript (ES6)
Vizualizasiya: Chart.js
Mənbə: Jira REST API (v2)
📁 Layihə Strukturu
Layihə qovluğunda aşağıdakı fayllar olmalıdır:

text

├── app.py              # Backend server (Flask)
├── index.html          # Frontend dashboard (HTML + JS)
└── README.md           # Bu sənədləşmə faylı
⚙️ İstifadə Olunan Jira Xüsusi Sahələri (Custom Fields)
Sistem məlumatları Jira-dan aşağıdakı field-lər vasitəsilə çəkir. Əgər Jira-da bu field-lərin ID-ləri dəyişsə, app.py və index.html içindəki ID-ləri yeniləmək lazımdır:

customfield_10101 - Sprint məlumatları
customfield_12703 - Çətinlik (Mətn/String)
customfield_13608 - Qurumun adı
customfield_12424 - Qurum (Ehtiyat field)
customfield_10015 / 10016 - Target Start / End

🚀 Sistemi İşə Salmaq (Run Etmək)
Addım 1: Python və kitabxanaların qurulması
Komputerinizdə Python 3 quraşdırılmış olmalıdır. Terminalı (və ya CMD-ni) açıb aşağıdakı əmrləri yazın:

bash

pip install flask requests urllib3
Addım 2: Backend serverin başladılması
Layihə qovluğuna terminal vasitəsilə daxil olun və Flask serverini işə salın:

bash

python app.py
Server uğurla başladıqdan sonra terminalda Running on http://127.0.0.1:5000 yazısı görünəcək. Bu pəncərəni açıq saxlayın.

Addım 3: Dashboard-u açmaq
Brauzerinizi (Google Chrome, Edge və s.) açın və ünvan çubuğuna yazın:

text

http://127.0.0.1:5000
Addım 4: Jira məlumatlarını daxil etmək
Səhifə açıldıqdan sonra sağ yuxarıdakı "Token" düyməsinə basın və aşağıdakıları daxil edin:

Jira URL: (Məsələn: https://jira.idda.az)
PAT Token: (Jira profilinizdən yaratdığınız Personal Access Token)
Layihə: (Məsələn: DGD)
"Məlumatları Yüklə" düyməsinə basın. Sistem məlumatları çəkəcək və dashboard dolduracaqdır. (Növbəti dəfə daxil olanda məlumatları avtomatik xatırlayacaq).

🔧 Dəyişiklik Edilməsi Üçün Təlimat
1. Yeni qrafik (chart) əlavə etmək istəyirsinizsə:
HTML hissəsində: <canvas id="yeniChart"></canvas> tag-i əlavə edin.
JS hissəsində: drawChart('yeniChart', 'bar', labels, data, colors, onClickCB) funksiyasını çağıraraq qrafiki çəkin. Görünüş növü olaraq 'bar', 'doughnut', 'line' və s. istifadə edə bilərsiniz.
2. Yeni Jira Field-i (mətni) əlavə etmək istəyirsinizsə:
app.py: fields = "..." yazılan sətirdən yeni customfield_XXXXX əlavə edin.
index.html: JS hissəsində t.fields['customfield_XXXXX'] çağıraraq datanı oxuyun və kartlara əlavə edin.
3. FiltrLəri (Sprint və Tarix) dəyişdirmək:
Filtr məntiqi applyFilters() funksiyasında yerləşir. filteredTasks massivi üzərində .filter() istifadə edərək istənilən şərti əlavə edib taskları süzgəcdən keçirə bilərsiniz.
Qeyd: Sistem localhost-da işləyir. Əgər şəbəkədən (başqa komputerlərdən) daxil olunmasını istəsəniz, app.py faylının ən sonundakı app.run(port=5000, debug=True) sətrini app.run(host='0.0.0.0', port=5000, debug=True) kimi dəyişdirin.