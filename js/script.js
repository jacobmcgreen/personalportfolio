// Simple Theme Toggle - No complications
        document.addEventListener('DOMContentLoaded', function() {
            const themeBtn = document.getElementById('theme-btn');
            const html = document.documentElement;
            
            // Load saved theme
            const savedTheme = localStorage.getItem('theme') || 'light';
            html.setAttribute('data-theme', savedTheme);
            themeBtn.textContent = savedTheme === 'light' ? '🌙' : '☀️';
            
            // Toggle theme
            themeBtn.addEventListener('click', function() {
                const currentTheme = html.getAttribute('data-theme');
                const newTheme = currentTheme === 'light' ? 'dark' : 'light';
                
                html.setAttribute('data-theme', newTheme);
                themeBtn.textContent = newTheme === 'light' ? '🌙' : '☀️';
                localStorage.setItem('theme', newTheme);
            });
            
            // Smooth scrolling
            document.querySelectorAll('a[href^="#"]').forEach(anchor => {
                anchor.addEventListener('click', function (e) {
                    e.preventDefault();
                    const target = document.querySelector(this.getAttribute('href'));
                    if (target) {
                        target.scrollIntoView({ behavior: 'smooth' });
                    }
                });
            });
        });