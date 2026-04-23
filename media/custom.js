function getCurrentLang() {
    const path = window.location.pathname;
    const lang = path.split('/')[1];
    return ['en', 'de'].includes(lang) ? lang : 'en';
}

function updateLogoLinkByLocale() {
    const currentLang = getCurrentLang();
    const logoLink = document.querySelector('.md-logo');
    
    if (logoLink) {
        logoLink.href = currentLang === 'en' ? '/doctrine/introduction/' : '/de/';
    }
}

function toggleHeaderSidebarVisibility() {
    const elementsToHide = document.querySelectorAll('.md-header, .md-sidebar__scrollwrap, .md-footer, h1');
    const sidebar = document.querySelector('.md-sidebar');
    const path = window.location.pathname;

    if (path !== '/' && path !== '' && path !== '/de/') {
        elementsToHide.forEach(element => {
            element.style.display = 'block';
            sidebar.style.setProperty('width', '12rem', 'important');
        });
    } else {
        elementsToHide.forEach(element => {
            element.style.display = 'none';
            sidebar.style.width = '0;'
        });
    }
}

function toggleHomeButtonVisibility() {
    const navLinks = document.querySelectorAll('li.md-nav__item a.md-nav__link');
    navLinks.forEach(link => {
        if (link.textContent.trim() === 'Home') {
            link.parentElement.style.display = 'none';
        }
    });
}

function redirectTo(pageUrl) {
    if (window.location.pathname.endsWith("index.html") || window.location.pathname === "/" || window.location.pathname === "") {
        window.location.href = pageUrl;
    }
}

document.addEventListener('DOMContentLoaded', function () {
    const currentLang = getCurrentLang();
    //redirectTo('/introduction/');
    toggleHomeButtonVisibility();
    toggleHeaderSidebarVisibility();
    updateLogoLinkByLocale();

    const observer = new MutationObserver(() => {
        toggleHomeButtonVisibility();
        toggleHeaderSidebarVisibility();
    });

    observer.observe(document.body, {
        childList: true,
        subtree: true
    });
});
