/**
 * Bar atas guru (gaya asal): [Menu Utama + mod gelap]  |  SejarahWira  |  [Profil]
 *
 * Berpindah halaman: tekan "Menu Utama", kemudian pilih kad.
 * Butang Logout kini berada di halaman Profil (lihat teacherLogout di bawah).
 *
 * @param {Object} config
 * @param {string} config.containerId - id elemen tempat bar dilukis (asal: 'top-nav-placeholder')
 * @param {string} config.homeUrl     - halaman Menu Utama
 */
function renderTopNav(config = {}) {
  const containerId = config.containerId || 'top-nav-placeholder';
  const container = document.getElementById(containerId);

  if (!container) {
    console.warn(`TopNav target element '#${containerId}' not found.`);
    return;
  }

  const homeUrl = config.homeUrl || 'index.html';

  // halaman semasa: butang Profil ditandakan jika kita sudah di Profil
  const here = window.location.pathname.split('/').pop();
  const onProfile = here === 'profile_teacher.html';

  container.innerHTML = `
    <nav class="top-nav">
      <!-- Kiri: Menu Utama dan butang mod cerah/gelap di sebelahnya -->
      <div class="nav-left">
        <a href="${homeUrl}" class="pixel-btn">
          <i class="fas fa-home"></i> Menu Utama
        </a>
        <button type="button" class="pixel-btn theme-toggle" data-theme-toggle aria-label="Tukar mod cerah / gelap"></button>
      </div>

      <!-- Tengah: tajuk -->
      <div class="nav-center">
        <h1 class="game-title"><i class="fas fa-gamepad"></i> SejarahWira</h1>
      </div>

      <!-- Kanan: Profil (Logout ada di dalam halaman Profil) -->
      <div class="nav-right">
        <a href="profile_teacher.html" class="pixel-btn"${onProfile ? ' aria-current="page"' : ''}>
          <i class="fas fa-chalkboard-teacher"></i> Profil
        </a>
      </div>
    </nav>
  `;

  if (window.SWTheme) window.SWTheme.bind(container);
}

/**
 * Log keluar guru: padam sesi dalam pelayar, beritahu pelayan, kembali ke halaman log masuk.
 * Dipanggil oleh butang Logout di halaman Profil.
 */
async function teacherLogout(logoutUrl = '../index.html') {
  localStorage.removeItem('sejarahwira_user');
  try {
    await fetch('/api/auth/logout');
  } catch (err) {
    console.error('Logout request failed:', err);
  }
  window.location.href = logoutUrl;
}
