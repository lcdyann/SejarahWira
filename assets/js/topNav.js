/**
 * Bar atas guru: SEMUA halaman guru (termasuk Utama) guna bar yang sama.
 *   baris 1: SejarahWira + butang mod gelap (kiri), Logout (kanan)
 *   baris 2: tab halaman (satu-satunya cara berpindah halaman)
 * Renders the SejarahWira Top Navigation Bar
 * @param {Object} config
 * @param {string} config.containerId - Target element ID (default: 'top-nav-placeholder')
 * @param {string} config.homeUrl - Path to main dashboard page
 * @param {string} config.logoutUrl - Path to redirect on logout
 */
const TEACHER_PAGES = [
  { file: 'index.html', label: 'Utama', icon: 'fa-house' },
  { file: 'content_manager.html', label: 'Kandungan', icon: 'fa-pen-ruler' },
  { file: 'class_manager.html', label: 'Kelas & Pelajar', icon: 'fa-users-gear' },
  { file: 'learning_progress_teacher.html', label: 'Kemajuan', icon: 'fa-chart-line' },
  { file: 'monitor_analytics.html', label: 'Analitik', icon: 'fa-chart-column' },
  { file: 'profile_teacher.html', label: 'Profil', icon: 'fa-chalkboard-teacher' }
];

function renderTopNav(config = {}) {
  const here = window.location.pathname.split('/').pop();
  const containerId = config.containerId || 'top-nav-placeholder';
  const container = document.getElementById(containerId);

  if (!container) {
    console.warn(`TopNav target element '#${containerId}' not found.`);
    return;
  }

  const homeUrl = config.homeUrl || 'index.html';
  const logoutUrl = config.logoutUrl || '../index.html';

  container.innerHTML = `
    <nav class="top-nav">
      <!-- Kiri: tajuk (pautan ke Utama) dan butang mod cerah/gelap di sebelahnya -->
      <div class="nav-brand">
        <h1 class="game-title"><a href="${homeUrl}"><i class="fas fa-gamepad"></i> SejarahWira</a></h1>
        <button type="button" class="pixel-btn theme-toggle" data-theme-toggle aria-label="Tukar mod cerah / gelap"></button>
      </div>

      <!-- Kanan: log keluar -->
      <div class="nav-right">
        <button type="button" id="nav-logout-btn" class="pixel-btn pixel-btn-logout">
          <i class="fas fa-right-from-bracket"></i> Logout
        </button>
      </div>
    </nav>
    <nav class="teacher-tabs" aria-label="Halaman guru">
      ${TEACHER_PAGES.map((p) => `<a class="teacher-tab${here === p.file ? ' is-current' : ''}" href="${p.file}"${here === p.file ? ' aria-current="page"' : ''}><i class="fas ${p.icon}"></i><span>${p.label}</span></a>`).join('')}
    </nav>
  `;

  if (window.SWTheme) window.SWTheme.bind(container);

  // Handle Logout Session Clear
  const logoutBtn = document.getElementById('nav-logout-btn');
  if (logoutBtn) {
    logoutBtn.addEventListener('click', async () => {
      localStorage.removeItem('sejarahwira_user');
      try {
        await fetch('/api/auth/logout');
      } catch (err) {
        console.error('Logout request failed:', err);
      }
      window.location.href = logoutUrl;
    });
  }
}