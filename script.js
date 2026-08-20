// ==========================================
// 1. APPLICATION STATE & CONFIG
// ==========================================
const NEXGEN_LOGOS = {
    light: "https://res.cloudinary.com/sahbncq8/image/upload/v1786081222/NexG1en_alefcv.png",
    dark: "https://res.cloudinary.com/sahbncq8/image/upload/v1786076819/NexGen_vzsaqb.png"
};

let app, auth, db;
let currentUser = null;
let productsList = [];
let appSettings = { name: "EduStore", logoUrl: "", bannerUrl: "", bannerType: "default" };

const STATE = {
    isAdminAuthenticated: false,
    isUploading: false,
    editingProductId: null,
    currentRoute: 'store', 
    currentParam: null,
    purchasedCourses: JSON.parse(localStorage.getItem('my_courses') || '[]'),
    cart: JSON.parse(localStorage.getItem('my_cart') || '[]'),
    checkoutItems: []
};

const appId = 'edustore-prod-app';

const firebaseConfig = {
    apiKey: "AIzaSyD42cki_snTp2kwqvRo-cFPbCb5HTSIt7g",
    authDomain: "studio-3097129257-24f1b.firebaseapp.com",
    databaseURL: "https://studio-3097129257-24f1b-default-rtdb.firebaseio.com",
    projectId: "studio-3097129257-24f1b",
    messagingSenderId: "661770847736",
    appId: "1:661770847736:web:b0af27337899b9de0c020d"
};

try {
    if (typeof firebase !== 'undefined') {
        app = firebase.initializeApp(firebaseConfig);
        auth = firebase.auth();
        db = firebase.firestore();
    } else {
        console.warn("Firebase SDK not loaded on window.");
    }
} catch (error) {
    console.error("Firebase init error:", error);
}

// ==========================================
// 2. BRANDING & THEME MANAGEMENT
// ==========================================
function getActiveThemeMode() {
    return localStorage.getItem('theme-mode') || 'system';
}

function isDarkEffective() {
    const mode = getActiveThemeMode();
    if (mode === 'dark') return true;
    if (mode === 'light') return false;
    return window.matchMedia('(prefers-color-scheme: dark)').matches;
}

function getActiveLogoUrl() {
    return isDarkEffective() ? NEXGEN_LOGOS.dark : NEXGEN_LOGOS.light;
}

function applyTheme() {
    const isDark = isDarkEffective();
    if (isDark) {
        document.documentElement.classList.add('dark');
        document.documentElement.classList.remove('light');
    } else {
        document.documentElement.classList.remove('dark');
        document.documentElement.classList.add('light');
    }
    
    // Update any rendered NexGen logo images
    const currentLogoUrl = getActiveLogoUrl();
    const logoImgs = document.querySelectorAll('.nexgen-logo-img');
    logoImgs.forEach(img => {
        if (img.src !== currentLogoUrl) {
            img.src = currentLogoUrl;
        }
    });

    renderHeader();
}

function setThemeMode(mode) {
    localStorage.setItem('theme-mode', mode);
    localStorage.setItem('theme', isDarkEffective() ? 'dark' : 'light'); // Backward compatibility
    applyTheme();
    renderApp();
}

// Auto sync when OS theme changes in system mode
window.matchMedia('(prefers-color-scheme: dark)').addEventListener('change', () => {
    if (getActiveThemeMode() === 'system') {
        applyTheme();
        renderApp();
    }
});

// ==========================================
// 3. UTILITY & NAVIGATION FUNCTIONS
// ==========================================
function showToast(message, type = 'success', duration = 3000) {
    const container = document.getElementById('toast-container');
    if (!container) return;
    const toast = document.createElement('div');
    const bgColor = type === 'success' ? 'bg-slate-900 dark:bg-white dark:text-slate-900 text-white' : type === 'error' ? 'bg-red-600 text-white' : 'bg-indigo-600 text-white';
    toast.className = `${bgColor} px-4 py-3 rounded-2xl shadow-xl flex items-center gap-3 transition-all duration-300 transform translate-y-0 opacity-100`;
    const icon = type === 'success' ? '<i data-lucide="check-circle-2" class="w-5 h-5 text-emerald-400"></i>' : '<i data-lucide="alert-circle" class="w-5 h-5"></i>';
    toast.innerHTML = `${icon} <span class="text-sm font-semibold flex-1">${message}</span>`;
    container.appendChild(toast);
    if (window.lucide) window.lucide.createIcons({ root: toast });
    setTimeout(() => {
        toast.classList.replace('translate-y-0', '-translate-y-4');
        toast.classList.replace('opacity-100', 'opacity-0');
        setTimeout(() => toast.remove(), 300);
    }, duration);
}

function formatCurrency(amount) {
    return new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(amount || 0);
}

function getStarsHtml() {
    return `
        <div class="flex items-center gap-0.5 mt-1">
            <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400 text-amber-400"></i>
            <i data-lucide="star" class="w-3.5 h-3.5 fill-amber-400 text-amber-400"></i>
            <span class="text-[10px] font-bold text-slate-400 ml-1">(5.0)</span>
        </div>
    `;
}

window.appNavigate = function(route, param = null) {
    STATE.currentRoute = route;
    STATE.currentParam = param;
    renderApp();
};

const initAuth = async () => {
    if (!auth) return;
    try { 
        await auth.signInAnonymously(); 
    } catch (error) { 
        console.error(error);
        showToast("Auth Error: Check Firebase Auth Rules.", "error", 5000); 
    }
};

const setupDataListeners = () => {
    if (!db || !currentUser) return;
    
    const productsRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('products');
    const settingsRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('settings').doc('main');
    
    productsRef.onSnapshot((snapshot) => {
        productsList = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
        productsList.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));
        renderApp();
    }, (error) => {
        console.error("Products snapshot error:", error);
        showToast("Firebase Permission Denied. Check DB Rules.", "error", 5000);
    });

    settingsRef.onSnapshot((snapshot) => {
        if (snapshot.exists) {
            appSettings = { ...appSettings, ...snapshot.data() };
            renderHeader(); 
        }
        renderApp();
    }, (error) => {
        console.error("Settings snapshot error:", error);
    });
};

// ==========================================
// 4. HEADER, THEME SWITCHER & FOOTER RENDERING
// ==========================================
function renderThemeSwitcherHTML() {
    const currentMode = getActiveThemeMode();
    return `
        <div class="theme-switcher-container" title="Select Theme">
            <button onclick="window.appMethods.setThemeMode('dark')" class="theme-btn ${currentMode === 'dark' ? 'active' : ''}" title="Dark Mode" aria-label="Dark Mode">
                <i data-lucide="moon" class="w-3.5 h-3.5"></i>
                <span class="hidden sm:inline ml-1.5 text-[11px]">Dark</span>
            </button>
            <button onclick="window.appMethods.setThemeMode('light')" class="theme-btn theme-btn-light ${currentMode === 'light' ? 'active' : ''}" title="Light Mode" aria-label="Light Mode">
                <i data-lucide="sun" class="w-3.5 h-3.5 text-amber-500"></i>
                <span class="hidden sm:inline ml-1.5 text-[11px]">Light</span>
                ${currentMode === 'light' ? '<span class="orange-dot"></span>' : ''}
            </button>
            <button onclick="window.appMethods.setThemeMode('system')" class="theme-btn ${currentMode === 'system' ? 'active' : ''}" title="System Auto Theme" aria-label="System Theme">
                <i data-lucide="monitor" class="w-3.5 h-3.5"></i>
                <span class="hidden sm:inline ml-1.5 text-[11px]">System</span>
            </button>
        </div>
    `;
}

function renderHeader() {
    const header = document.getElementById('app-header');
    if (!header || typeof STATE === 'undefined' || !STATE) return;

    const currentLogoUrl = getActiveLogoUrl();

    // Back button logic for detail pages vs logo branding
    let leftContent = `
        <div class="flex items-center gap-2.5">
            <img src="${currentLogoUrl}" alt="NexGen Digital" class="h-6 sm:h-8 object-contain nexgen-logo-img">
            <div class="h-5 w-px bg-slate-300 dark:bg-slate-700"></div>
        </div>
    `;
    
    if (['product', 'checkout', 'cart'].includes(STATE.currentRoute)) {
        leftContent = `<button onclick="window.appNavigate('store')" class="p-2 -ml-2 text-slate-600 dark:text-slate-300 active:bg-slate-100 dark:active:bg-slate-800 rounded-full" title="Back to Store"><i data-lucide="arrow-left" class="w-6 h-6"></i></button>`;
    }

    header.innerHTML = `
        <div class="flex items-center justify-between w-full max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
            <div class="flex items-center gap-3">
                ${leftContent}
                ${STATE.currentRoute === 'store' || STATE.currentRoute === 'profile' || STATE.currentRoute === 'courses' ? `
                <div class="flex flex-col justify-center">
                    <span class="font-extrabold text-base sm:text-xl leading-tight text-slate-900 dark:text-white tracking-tight">${appSettings.name || 'EduStore'}</span>
                    <span class="text-[9px] sm:text-[10px] font-bold text-indigo-600 dark:text-indigo-400 tracking-wider uppercase">Learn more, Earn more.</span>
                </div>` : `<span class="font-extrabold text-base sm:text-xl text-slate-900 dark:text-white">${
                    STATE.currentRoute === 'cart' ? 'Your Cart' : 
                    STATE.currentRoute === 'checkout' ? 'Secure Checkout' : 'Product Details'
                }</span>`}
            </div>
            
            <div class="flex items-center gap-3 sm:gap-4">
                ${renderThemeSwitcherHTML()}
                <button onclick="window.appNavigate('cart')" class="relative p-2 text-slate-600 dark:text-slate-300 hover:text-indigo-600 dark:hover:text-indigo-400 active:bg-slate-100 dark:active:bg-slate-800 rounded-full transition-colors" title="Cart">
                    <i data-lucide="shopping-bag" class="w-5 h-5 sm:w-6 sm:h-6"></i>
                    ${STATE.cart.length > 0 ? `<span class="absolute top-1 right-1 bg-rose-500 text-white text-[9px] font-bold w-4 h-4 rounded-full flex items-center justify-center border-2 border-white dark:border-darkcard">${STATE.cart.length}</span>` : ''}
                </button>
            </div>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons({ root: header });
}

function getFooterHTML() {
    const currentLogoUrl = getActiveLogoUrl();
    return `
        <footer id="app-footer" class="w-full bg-white/80 dark:bg-slate-900/80 glassmorphism border-t border-slate-200/80 dark:border-slate-800/80 py-10 px-4 text-center transition-colors duration-300 mt-12">
            <div class="max-w-7xl mx-auto flex flex-col items-center gap-4">
                <img src="${currentLogoUrl}" alt="NexGen Digital Logo" class="h-10 sm:h-12 object-contain transition-all duration-300 nexgen-logo-img">
                <p class="text-sm text-slate-500 dark:text-slate-400 font-medium">Crafted for simplicity and performance.</p>
                <p class="text-xs font-semibold text-slate-600 dark:text-slate-400">© 2026 NexGen Digital. All Rights Reserved.</p>
                <a href="https://nexgendigital.tech" target="_blank" rel="noopener noreferrer" class="inline-flex items-center gap-2 px-5 py-2.5 rounded-full text-xs sm:text-sm font-extrabold text-white bg-gradient-to-r from-orange-500 via-indigo-600 to-purple-600 hover:from-orange-600 hover:to-purple-700 shadow-md hover:shadow-lg transition-all transform hover:-translate-y-0.5 active:translate-y-0 mt-2">
                    <span>Built by NexGen Digital • nexgendigital.tech</span>
                    <i data-lucide="external-link" class="w-4 h-4"></i>
                </a>
            </div>
        </footer>
    `;
}

function renderBottomTabs() {
    const tabs = document.getElementById('bottom-tabs');
    if (!tabs || typeof STATE === 'undefined' || !STATE) return;
    
    if (['product', 'checkout', 'cart'].includes(STATE.currentRoute)) {
        tabs.classList.add('hidden');
        return;
    }
    tabs.classList.remove('hidden');
    
    const activeColor = 'text-indigo-600 dark:text-indigo-400';
    const inactiveColor = 'text-slate-400 dark:text-slate-500';

    tabs.innerHTML = `
        <div class="flex justify-around items-center h-16 w-full max-w-7xl mx-auto px-4 sm:px-6 relative">
            <button onclick="window.appNavigate('store')" class="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 h-full px-4 active:scale-95 transition-all ${STATE.currentRoute === 'store' ? activeColor : inactiveColor}">
                <i data-lucide="store" class="w-5 h-5 sm:w-6 sm:h-6 ${STATE.currentRoute === 'store' ? 'fill-indigo-50 dark:fill-indigo-900/30' : ''}"></i>
                <span class="text-[10px] sm:text-xs font-semibold">Store</span>
            </button>
            <button onclick="window.appNavigate('courses')" class="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 h-full px-4 active:scale-95 transition-all ${STATE.currentRoute === 'courses' ? activeColor : inactiveColor}">
                <i data-lucide="play-square" class="w-5 h-5 sm:w-6 sm:h-6 ${STATE.currentRoute === 'courses' ? 'fill-indigo-50 dark:fill-indigo-900/30' : ''}"></i>
                <span class="text-[10px] sm:text-xs font-semibold">My Courses</span>
            </button>
            <button onclick="window.appNavigate('profile')" class="flex flex-col sm:flex-row items-center justify-center gap-1 sm:gap-2 h-full px-4 active:scale-95 transition-all ${STATE.currentRoute === 'profile' ? activeColor : inactiveColor}">
                <i data-lucide="user" class="w-5 h-5 sm:w-6 sm:h-6 ${STATE.currentRoute === 'profile' ? 'fill-indigo-50 dark:fill-indigo-900/30' : ''}"></i>
                <span class="text-[10px] sm:text-xs font-semibold">Profile</span>
            </button>
        </div>
    `;
    if (window.lucide) window.lucide.createIcons({ root: tabs });
}

// ==========================================
// 5. APP SCREENS (FULL-SCREEN RESPONSIVE LAYOUTS)
// ==========================================
function getStoreScreen() {
    let html = `<div class="app-screen w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 pb-12">`;

    if (appSettings.bannerType === 'custom' && appSettings.bannerUrl) {
        html += `<div class="w-full rounded-[2rem] overflow-hidden shadow-xl relative aspect-[21/9] sm:aspect-[24/8] bg-slate-100 dark:bg-slate-800 border border-slate-100 dark:border-slate-800"><img src="${appSettings.bannerUrl}" class="w-full h-full object-cover" alt="Advertisement Banner"></div>`;
    } else {
        html += `
            <div class="bg-gradient-to-r from-indigo-900 via-indigo-800 to-purple-800 rounded-[2rem] p-6 sm:p-10 text-white shadow-xl relative overflow-hidden">
                <div class="absolute -top-10 -right-10 opacity-10"><i data-lucide="sparkles" class="w-64 h-64"></i></div>
                <div class="relative z-10 space-y-3 max-w-2xl">
                    <span class="bg-white/20 text-white text-xs font-bold px-3 py-1 rounded-full uppercase tracking-widest backdrop-blur-md border border-white/10">Premium Content</span>
                    <h1 class="text-3xl sm:text-5xl font-extrabold tracking-tight leading-tight">Unlock Your Potential</h1>
                    <p class="text-indigo-100 text-sm sm:text-base opacity-90 font-medium">Learn more, Earn more.</p>
                </div>
            </div>
        `;
    }

    html += `
        <div>
            <div class="flex items-center justify-between mb-6 px-1">
                <h2 class="text-xl sm:text-2xl font-extrabold text-slate-900 dark:text-white">Trending Courses</h2>
                <span class="text-xs sm:text-sm font-semibold text-slate-400 bg-slate-100 dark:bg-slate-800 px-3 py-1 rounded-full">${productsList.length} items</span>
            </div>
    `;

    if (productsList.length === 0) {
        html += `
            <div class="bg-white dark:bg-darkcard rounded-3xl border border-slate-100 dark:border-slate-800 p-12 text-center flex flex-col items-center shadow-sm">
                <div class="w-20 h-20 bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-500 rounded-2xl flex items-center justify-center mb-4"><i data-lucide="package-open" class="w-10 h-10"></i></div>
                <h3 class="text-lg font-bold text-slate-800 dark:text-slate-200">Store is Empty</h3>
                <p class="text-sm text-slate-500 mt-1">Check back later for new content.</p>
            </div>
        `;
    } else {
        html += `<div class="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-6">`;
        productsList.forEach(product => {
            const imgUrl = product.imageUrl || 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&q=80&w=600';
            let priceHtml = product.discountPercent > 0 
                ? `<span class="text-lg font-black text-slate-900 dark:text-white">${formatCurrency(product.discountedPrice)}</span> <span class="text-xs font-medium text-slate-400 line-through ml-1">${formatCurrency(product.price)}</span>`
                : `<span class="text-lg font-black text-slate-900 dark:text-white">${formatCurrency(product.price)}</span>`;

            html += `
                <div onclick="window.appNavigate('product', '${product.id}')" class="bg-white dark:bg-darkcard rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm hover:shadow-lg transition-all duration-300 overflow-hidden flex flex-col cursor-pointer group hover:-translate-y-1">
                    <div class="w-full aspect-video bg-slate-100 dark:bg-slate-800 relative overflow-hidden">
                        <img src="${imgUrl}" alt="${product.title}" class="w-full h-full object-cover group-hover:scale-105 transition-transform duration-500 ease-out">
                        ${product.discountPercent > 0 ? `<div class="absolute top-3 left-3 bg-rose-500 text-white px-2 py-0.5 rounded-lg text-xs font-black shadow-md">${product.discountPercent}% OFF</div>` : ''}
                    </div>
                    <div class="p-5 flex flex-col flex-grow justify-between gap-3">
                        <div>
                            <h3 class="text-base font-bold text-slate-900 dark:text-slate-100 leading-snug line-clamp-2 group-hover:text-indigo-600 dark:group-hover:text-indigo-400 transition-colors">${product.title}</h3>
                            ${getStarsHtml()}
                        </div>
                        <div class="flex items-center justify-between mt-2 pt-3 border-t border-slate-100 dark:border-slate-800/60">
                            <div>${priceHtml}</div>
                            <span class="text-xs font-bold text-indigo-600 dark:text-indigo-400 flex items-center gap-1 group-hover:translate-x-1 transition-transform">
                                Details <i data-lucide="chevron-right" class="w-3.5 h-3.5"></i>
                            </span>
                        </div>
                    </div>
                </div>
            `;
        });
        html += `</div>`;
    }
    
    html += `</div>${getFooterHTML()}</div>`;
    return html;
}

function getProductDetailScreen(productId) {
    const product = productsList.find(p => p.id === productId);
    if (!product) return `<div class="p-8 text-center text-red-500">Product not found</div>`;
    
    const imgUrl = product.imageUrl || 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&q=80&w=600';
    const isPurchased = STATE.purchasedCourses.includes(product.id);
    const inCart = STATE.cart.includes(product.id);

    let priceHtml = product.discountPercent > 0 
        ? `<span class="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">${formatCurrency(product.discountedPrice)}</span> <span class="text-base font-semibold text-slate-400 line-through ml-2">${formatCurrency(product.price)}</span> <span class="bg-rose-100 text-rose-600 px-3 py-1 rounded-xl text-xs font-bold ml-3">Save ${product.discountPercent}%</span>`
        : `<span class="text-3xl sm:text-4xl font-black text-slate-900 dark:text-white">${formatCurrency(product.price)}</span>`;

    return `
        <div class="app-screen w-full mx-auto relative h-full flex flex-col bg-white dark:bg-darkbg">
            <div class="flex-1 overflow-y-auto no-scrollbar pb-32">
                <div class="max-w-6xl mx-auto p-4 sm:p-6 lg:p-8 grid grid-cols-1 lg:grid-cols-2 gap-8 items-start">
                    <div class="w-full aspect-video sm:aspect-square bg-slate-100 dark:bg-slate-800 rounded-3xl overflow-hidden shadow-lg border border-slate-100 dark:border-slate-800">
                        <img src="${imgUrl}" alt="${product.title}" class="w-full h-full object-cover">
                    </div>
                    
                    <div class="space-y-6">
                        <div>
                            <h1 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white leading-tight">${product.title}</h1>
                            ${getStarsHtml()}
                        </div>
                        
                        <div class="flex items-center border-b border-slate-100 dark:border-slate-800 pb-6">
                            ${priceHtml}
                        </div>
                        
                        <div>
                            <h3 class="text-sm font-bold text-slate-900 dark:text-white mb-3 uppercase tracking-wider">Description</h3>
                            <p class="text-slate-600 dark:text-slate-400 leading-relaxed whitespace-pre-wrap text-sm sm:text-base">${product.description}</p>
                        </div>

                        <div class="hidden lg:flex gap-4 pt-4">
                            ${isPurchased ? `
                                <button onclick="window.appNavigate('courses')" class="w-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-base">
                                    <i data-lucide="check-circle" class="w-5 h-5"></i> You Own This (View Course)
                                </button>
                            ` : `
                                <button onclick="window.appMethods.toggleCart('${product.id}')" class="flex-1 bg-slate-100 dark:bg-slate-800 hover:bg-slate-200 text-slate-900 dark:text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-base border border-slate-200 dark:border-slate-700">
                                    <i data-lucide="shopping-cart" class="w-5 h-5"></i> ${inCart ? 'Go to Cart' : 'Add to Cart'}
                                </button>
                                <button onclick="window.appMethods.startCheckout('${product.id}')" class="flex-1 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-base shadow-lg shadow-indigo-600/30">
                                    <i data-lucide="zap" class="w-5 h-5"></i> Buy Now
                                </button>
                            `}
                        </div>
                    </div>
                </div>

                ${getFooterHTML()}
            </div>

            <!-- STICKY BOTTOM CALL TO ACTION FOR MOBILE/TABLET -->
            <div class="lg:hidden fixed bottom-0 left-0 w-full bg-white/90 dark:bg-darkcard/90 glassmorphism border-t border-slate-200 dark:border-slate-800 p-4 pb-safe z-50">
                <div class="max-w-xl mx-auto flex gap-3">
                    ${isPurchased ? `
                        <button onclick="window.appNavigate('courses')" class="w-full bg-emerald-100 dark:bg-emerald-900/30 text-emerald-700 dark:text-emerald-400 font-bold py-4 rounded-2xl flex items-center justify-center gap-2 text-sm">
                            <i data-lucide="check-circle" class="w-5 h-5"></i> You Own This (View Course)
                        </button>
                    ` : `
                        <button onclick="window.appMethods.toggleCart('${product.id}')" class="flex-1 bg-slate-100 dark:bg-slate-800 active:bg-slate-200 text-slate-900 dark:text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm border border-slate-200 dark:border-slate-700">
                            <i data-lucide="shopping-cart" class="w-5 h-5"></i> ${inCart ? 'Go to Cart' : 'Add to Cart'}
                        </button>
                        <button onclick="window.appMethods.startCheckout('${product.id}')" class="flex-1 bg-indigo-600 active:bg-indigo-700 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-sm shadow-lg shadow-indigo-600/30">
                            <i data-lucide="zap" class="w-5 h-5"></i> Buy Now
                        </button>
                    `}
                </div>
            </div>
        </div>
    `;
}

function getCartScreen() {
    let html = `<div class="app-screen w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-24">`;
    
    if (STATE.cart.length === 0) {
        html += `
            <div class="text-center py-24">
                <div class="w-24 h-24 bg-slate-100 dark:bg-slate-800 rounded-full flex items-center justify-center mx-auto mb-4 text-slate-400">
                    <i data-lucide="shopping-bag" class="w-12 h-12"></i>
                </div>
                <h2 class="text-2xl font-bold text-slate-900 dark:text-white">Your cart is empty</h2>
                <p class="text-slate-500 mt-2 text-base">Looks like you haven't added anything yet.</p>
                <button onclick="window.appNavigate('store')" class="mt-8 bg-indigo-600 text-white font-bold py-4 px-10 rounded-2xl shadow-lg hover:bg-indigo-700 transition-colors">Start Shopping</button>
            </div>
            ${getFooterHTML()}
        </div>`;
        return html;
    }

    let total = 0;
    html += `<div class="grid grid-cols-1 lg:grid-cols-3 gap-8">`;
    html += `<div class="lg:col-span-2 space-y-4">`;
    STATE.cart.forEach(id => {
        const product = productsList.find(p => p.id === id);
        if(product) {
            const price = product.discountPercent > 0 ? product.discountedPrice : product.price;
            total += price;
            html += `
                <div class="bg-white dark:bg-darkcard p-4 rounded-[1.5rem] flex gap-4 sm:gap-6 border border-slate-100 dark:border-slate-800 shadow-sm relative items-center">
                    <img src="${product.imageUrl || 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&q=80&w=600'}" class="w-24 h-24 sm:w-28 sm:h-28 rounded-2xl object-cover bg-slate-100 dark:bg-slate-800 flex-none shadow-sm border border-slate-100 dark:border-slate-800/60">
                    <div class="flex-grow py-1 pr-10">
                        <h3 class="font-bold text-slate-900 dark:text-white text-base sm:text-lg leading-snug line-clamp-2">${product.title}</h3>
                        <p class="text-indigo-600 dark:text-indigo-400 font-black text-lg sm:text-xl mt-2">${formatCurrency(price)}</p>
                    </div>
                    <button onclick="window.appMethods.removeFromCart('${product.id}')" class="absolute top-4 right-4 p-2 text-slate-400 hover:text-red-500 rounded-xl transition-colors" title="Remove">
                        <i data-lucide="x" class="w-6 h-6"></i>
                    </button>
                </div>
            `;
        }
    });
    html += `</div>`;
    
    html += `
        <div class="lg:col-span-1 space-y-4">
            <div class="bg-white dark:bg-darkcard p-6 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm space-y-4">
                <h3 class="text-lg font-bold text-slate-900 dark:text-white border-b border-slate-100 dark:border-slate-800 pb-3">Order Summary</h3>
                <div class="flex justify-between items-center text-sm font-semibold text-slate-600 dark:text-slate-300"><span>Subtotal</span><span>${formatCurrency(total)}</span></div>
                <div class="flex justify-between items-center text-xl font-black text-slate-900 dark:text-white pt-3 border-t border-slate-100 dark:border-slate-800"><span>Total</span><span>${formatCurrency(total)}</span></div>
                
                <button onclick="window.appMethods.startCheckout('cart')" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl transition-all flex items-center justify-center gap-2 text-base shadow-lg shadow-indigo-600/30 mt-4">
                    Proceed to Checkout <i data-lucide="arrow-right" class="w-5 h-5"></i>
                </button>
            </div>
        </div>
    </div>
    `;

    html += `
        ${getFooterHTML()}
        </div>
    `;
    return html;
}

function getCheckoutScreen() {
    let items = [];
    let total = 0;
    if (STATE.currentParam === 'cart') {
        items = STATE.cart.map(id => productsList.find(p => p.id === id)).filter(Boolean);
    } else {
        const singleProd = productsList.find(p => p.id === STATE.currentParam);
        if(singleProd) items = [singleProd];
    }

    if (items.length === 0) return `<div class="p-8 text-center text-red-500">No items to checkout</div>`;

    items.forEach(p => total += (p.discountPercent > 0 ? p.discountedPrice : p.price));
    STATE.checkoutItems = items;

    return `
        <div class="app-screen w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-24">
            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div class="lg:col-span-1">
                    <div class="bg-indigo-50 dark:bg-indigo-900/20 rounded-[2rem] p-6 border border-indigo-100 dark:border-indigo-800/50 sticky top-4">
                        <p class="text-xs font-bold text-indigo-600 dark:text-indigo-400 uppercase tracking-wider mb-2">Order Summary</p>
                        <h3 class="text-3xl font-black text-slate-900 dark:text-white">${formatCurrency(total)}</h3>
                        <p class="text-sm font-medium text-slate-500 mt-2">${items.length} item(s) selected</p>
                    </div>
                </div>

                <div class="lg:col-span-2">
                    <div class="bg-white dark:bg-darkcard p-6 sm:p-8 rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm space-y-6">
                        <h2 class="text-xl font-bold text-slate-900 dark:text-white">Student Information</h2>
                        <form id="checkout-form" class="space-y-5">
                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div class="space-y-1.5">
                                    <label class="text-xs font-bold text-slate-700 dark:text-slate-300 ml-1">Full Name</label>
                                    <input type="text" id="chk-name" required placeholder="Student Name" class="w-full px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-darkcard dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm">
                                </div>
                                <div class="space-y-1.5">
                                    <label class="text-xs font-bold text-slate-700 dark:text-slate-300 ml-1">Mobile Number</label>
                                    <input type="tel" id="chk-mobile" required placeholder="+91 0000000000" class="w-full px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-darkcard dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm">
                                </div>
                            </div>

                            <div class="grid grid-cols-1 sm:grid-cols-2 gap-5">
                                <div class="space-y-1.5">
                                    <label class="text-xs font-bold text-slate-700 dark:text-slate-300 ml-1">Email ID</label>
                                    <input type="email" id="chk-email" required placeholder="student@example.com" class="w-full px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-darkcard dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm">
                                </div>
                                <div class="space-y-1.5">
                                    <label class="text-xs font-bold text-slate-700 dark:text-slate-300 ml-1">Choose Class</label>
                                    <select id="chk-class" required class="w-full px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-darkcard dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium text-sm appearance-none">
                                        <option value="" disabled selected>Select your class</option>
                                        <option value="Class 6">Class 6</option>
                                        <option value="Class 7">Class 7</option>
                                        <option value="Class 8">Class 8</option>
                                        <option value="Other">Other</option>
                                    </select>
                                </div>
                            </div>
                            
                            <button type="button" onclick="window.appMethods.processCheckout()" class="w-full bg-indigo-600 hover:bg-indigo-700 active:bg-indigo-800 text-white font-bold py-4 rounded-2xl transition-all text-base shadow-xl flex items-center justify-center gap-2 mt-6">
                                <i data-lucide="lock" class="w-5 h-5"></i> Proceed to Payment Gateway
                            </button>
                        </form>
                    </div>
                </div>
            </div>

            ${getFooterHTML()}
        </div>
    `;
}

function getMyCoursesScreen() {
    const purchasedProducts = productsList.filter(p => STATE.purchasedCourses.includes(p.id));
    let html = `
        <div class="app-screen w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-8">
            <div class="flex items-center justify-between mb-4 px-1">
                <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white">My Courses</h2>
                <span class="bg-indigo-100 dark:bg-indigo-900/50 text-indigo-700 dark:text-indigo-300 text-xs sm:text-sm font-bold px-4 py-1.5 rounded-full">${purchasedProducts.length} Access</span>
            </div>
    `;
    if (purchasedProducts.length === 0) {
        html += `
            <div class="bg-white dark:bg-darkcard rounded-3xl border border-slate-100 dark:border-slate-800 p-12 text-center flex flex-col items-center shadow-sm mt-8">
                <div class="w-24 h-24 bg-slate-50 dark:bg-slate-800 text-slate-300 dark:text-slate-500 rounded-full flex items-center justify-center mb-4"><i data-lucide="book-x" class="w-12 h-12"></i></div>
                <h3 class="text-xl font-bold text-slate-800 dark:text-slate-200">No Courses Yet</h3>
                <p class="text-base text-slate-500 mt-2 max-w-md">You haven't purchased any digital products yet. Visit the store to explore.</p>
                <button onclick="window.appNavigate('store')" class="mt-8 bg-indigo-600 text-white font-bold py-3.5 px-8 rounded-2xl shadow-md hover:bg-indigo-700 transition-colors">Explore Store</button>
            </div>
        `;
    } else {
        html += `<div class="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-6">`;
        purchasedProducts.forEach(product => {
            html += `
                <div class="bg-white dark:bg-darkcard rounded-2xl border border-slate-100 dark:border-slate-800 shadow-sm p-4 flex flex-col justify-between gap-4">
                    <div class="flex gap-4 items-center">
                        <img src="${product.imageUrl || 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&q=80&w=600'}" class="w-20 h-20 rounded-xl object-cover flex-none bg-slate-100 dark:bg-slate-800 shadow-sm">
                        <div class="flex flex-col min-w-0">
                            <h3 class="font-bold text-slate-900 dark:text-slate-100 text-base line-clamp-2 leading-snug">${product.title}</h3>
                        </div>
                    </div>
                    <a href="${product.driveLink}" target="_blank" class="bg-indigo-600 hover:bg-indigo-700 text-white text-sm font-bold px-4 py-3 rounded-xl flex items-center justify-center gap-2 transition-colors w-full shadow-md">
                        <i data-lucide="external-link" class="w-4 h-4"></i> Access Course Materials
                    </a>
                </div>
            `;
        });
        html += `</div>`;
    }
    html += `${getFooterHTML()}</div>`;
    return html;
}

function getProfileScreen() {
    return `
        <div class="app-screen w-full max-w-4xl mx-auto p-4 sm:p-6 lg:p-8 space-y-6 pb-8">
            <h2 class="text-2xl sm:text-3xl font-extrabold text-slate-900 dark:text-white mb-4 px-1">Settings</h2>
            
            <div class="bg-white dark:bg-darkcard rounded-[2rem] border border-slate-100 dark:border-slate-800 p-6 sm:p-8 flex items-center gap-6 shadow-sm">
                <div class="w-20 h-20 bg-gradient-to-br from-indigo-500 to-purple-600 rounded-full flex items-center justify-center text-white text-2xl font-bold shadow-md"><i data-lucide="user" class="w-10 h-10"></i></div>
                <div>
                    <h3 class="text-xl font-bold text-slate-900 dark:text-white">Guest Learner</h3>
                    <p class="text-sm text-slate-500 dark:text-slate-400 mt-1">ID: ${currentUser ? currentUser.uid.substring(0,8) : 'Connecting...'}</p>
                </div>
            </div>

            <div class="bg-white dark:bg-darkcard rounded-[2rem] border border-slate-100 dark:border-slate-800 shadow-sm overflow-hidden p-6 space-y-6">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4 text-slate-700 dark:text-slate-200 font-semibold text-base">
                        <div class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400"><i data-lucide="sun" class="w-5 h-5"></i></div>
                        <span>Theme Preferences</span>
                    </div>
                    ${renderThemeSwitcherHTML()}
                </div>

                <div class="border-t border-slate-100 dark:border-slate-800 pt-4">
                    <button onclick="window.appNavigate('admin')" class="w-full flex items-center justify-between py-2 text-left hover:opacity-80 transition-opacity">
                        <div class="flex items-center gap-4 text-slate-700 dark:text-slate-200 font-semibold text-base">
                            <div class="w-10 h-10 rounded-full bg-slate-100 dark:bg-slate-800 flex items-center justify-center text-slate-500 dark:text-slate-400"><i data-lucide="shield" class="w-5 h-5"></i></div>
                            <span>Admin Panel</span>
                        </div>
                        <i data-lucide="chevron-right" class="w-6 h-6 text-slate-400"></i>
                    </button>
                </div>
            </div>

            ${getFooterHTML()}
        </div>
    `;
}

function getAdminLoginScreen() {
    return `
        <div class="app-screen flex flex-col items-center justify-center min-h-[70vh] p-4 max-w-md mx-auto">
            <div class="w-full bg-white dark:bg-darkcard p-8 sm:p-10 rounded-[2rem] shadow-xl border border-slate-100 dark:border-slate-800">
                <div class="text-center mb-8">
                    <div class="w-20 h-20 bg-indigo-50 dark:bg-indigo-900/30 text-indigo-600 dark:text-indigo-400 rounded-3xl flex items-center justify-center mx-auto mb-5"><i data-lucide="lock-keyhole" class="w-10 h-10"></i></div>
                    <h2 class="text-2xl font-extrabold text-slate-900 dark:text-white">Admin Security</h2>
                </div>
                <form id="admin-login-form" class="space-y-4">
                    <input type="text" id="admin-id" autocomplete="username" placeholder="Admin ID" class="w-full px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium" required>
                    <input type="password" id="admin-pass" autocomplete="current-password" placeholder="Password" class="w-full px-5 py-4 rounded-2xl border border-slate-200 dark:border-slate-700 bg-slate-50 dark:bg-slate-800 dark:text-white outline-none focus:ring-2 focus:ring-indigo-500 font-medium" required>
                    <button type="submit" class="w-full bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl mt-2 transition-colors">Authenticate</button>
                </form>
            </div>
            ${getFooterHTML()}
        </div>
    `;
}

function getAdminDashboardScreen() {
    let html = `
        <div class="app-screen w-full max-w-7xl mx-auto p-4 sm:p-6 lg:p-8 space-y-8 pb-12">
            <div class="flex justify-between items-center bg-slate-900 dark:bg-slate-800 text-white p-6 sm:p-8 rounded-[2rem] shadow-lg">
                <div>
                    <h1 class="text-2xl font-extrabold">Admin Dashboard</h1>
                    <p class="text-slate-400 text-sm font-medium mt-1">Manage complete application</p>
                </div>
                <button onclick="window.appMethods.logoutAdmin()" class="bg-white/10 hover:bg-white/20 p-3.5 rounded-2xl transition-colors" title="Logout"><i data-lucide="log-out" class="w-6 h-6"></i></button>
            </div>

            <div class="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <div class="lg:col-span-2 bg-white dark:bg-darkcard p-6 sm:p-8 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800">
                    <div class="flex justify-between items-center mb-6">
                        <h2 id="form-title" class="text-xl font-extrabold text-slate-900 dark:text-white flex items-center gap-2">
                            <i data-lucide="plus-circle" class="w-6 h-6 text-indigo-600"></i> Add Product
                        </h2>
                        <button id="cancel-edit-btn" onclick="window.appMethods.cancelEdit()" class="hidden text-xs font-bold text-slate-500 bg-slate-100 dark:bg-slate-800 px-3.5 py-2 rounded-xl">Cancel Edit</button>
                    </div>
                    <form id="add-product-form" class="space-y-5">
                        <div><label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 ml-1">Title</label><input type="text" id="prod-title" required class="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-2xl outline-none text-sm font-medium"></div>
                        <div><label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 ml-1">Description</label><textarea id="prod-desc" required rows="3" class="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-2xl outline-none text-sm font-medium"></textarea></div>
                        
                        <div class="grid grid-cols-2 gap-5">
                            <div><label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 ml-1">Original Price (₹)</label><input type="number" id="prod-price" required min="0" step="0.01" class="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-2xl outline-none text-sm font-medium" oninput="window.appMethods.calculateDiscount()"></div>
                            <div><label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 ml-1">Discount Price (₹)</label><input type="number" id="prod-disc-price" required min="0" step="0.01" class="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-2xl outline-none text-sm font-medium" oninput="window.appMethods.calculateDiscount()"></div>
                        </div>
                        <div id="discount-badge" class="hidden ml-1 text-xs font-black text-rose-500">Auto calculated: <span id="discount-val">0</span>% OFF</div>
                        
                        <div><label class="block text-xs font-bold text-slate-700 dark:text-slate-300 mb-1.5 ml-1">Payment URL</label><input type="url" id="prod-paylink" placeholder="Stripe/Razorpay link" required class="w-full px-5 py-3.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 dark:text-white rounded-2xl outline-none text-sm font-medium"></div>
                        
                        <div class="border-t border-slate-100 dark:border-slate-700 pt-5 mt-2 space-y-4">
                            <div><label class="block text-xs font-black text-emerald-600 dark:text-emerald-400 mb-2 uppercase">Course Access URL</label><input type="url" id="prod-drive-link" placeholder="https://drive.google.com/..." required class="w-full px-5 py-3.5 bg-emerald-50 dark:bg-emerald-900/20 border border-emerald-200 dark:border-emerald-800 dark:text-white rounded-2xl outline-none text-sm font-medium"></div>
                            
                            <div>
                                <label class="block text-xs font-black text-indigo-600 dark:text-indigo-400 mb-2 uppercase">Direct Cover Image</label>
                                <input type="file" id="prod-image" accept="image/*" class="w-full text-sm text-slate-500 dark:text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-indigo-600 file:text-white">
                                <p id="edit-img-note" class="hidden mt-1 text-[10px] text-slate-400 ml-1">(Optional during edit. Upload new to replace)</p>
                            </div>
                        </div>
                        <button type="submit" id="submit-btn" class="w-full mt-4 bg-indigo-600 hover:bg-indigo-700 text-white font-bold py-4 rounded-2xl text-base shadow-md flex items-center justify-center gap-2"><i data-lucide="upload-cloud" class="w-5 h-5"></i> Publish Product</button>
                    </form>
                </div>

                <div class="lg:col-span-1 space-y-8">
                    <div class="bg-white dark:bg-darkcard p-6 rounded-[2rem] shadow-sm border border-slate-100 dark:border-slate-800">
                        <div class="flex justify-between items-center mb-5"><h2 class="text-lg font-extrabold text-slate-900 dark:text-white">Directory</h2></div>
    `;
    if (productsList.length === 0) html += `<div class="p-8 bg-slate-50 dark:bg-slate-800 rounded-[1.5rem] text-center text-sm font-medium text-slate-500">No products uploaded yet.</div>`;
    else {
        html += `<div class="space-y-4 max-h-[400px] overflow-y-auto pr-1">`;
        productsList.forEach(product => {
            html += `
                <div class="bg-slate-50 dark:bg-slate-800 p-3.5 rounded-2xl flex gap-4 relative items-center">
                    <img src="${product.imageUrl || 'https://images.unsplash.com/photo-1532012197267-da84d127e765?auto=format&fit=crop&q=80&w=600'}" class="w-14 h-14 rounded-xl object-cover flex-none bg-slate-100 dark:bg-slate-800 border border-slate-100 dark:border-slate-800/60">
                    <div class="flex-grow min-w-0 py-1 pr-14">
                        <h3 class="font-bold text-slate-900 dark:text-white text-sm line-clamp-1">${product.title}</h3>
                        <p class="text-xs text-emerald-600 font-bold mt-0.5">${formatCurrency(product.discountedPrice)}</p>
                    </div>
                    <div class="absolute top-3.5 right-3 flex gap-1">
                        <button onclick="window.appMethods.editProduct('${product.id}')" class="p-1.5 text-indigo-500 hover:text-indigo-600 active:bg-indigo-50 rounded-lg transition-colors" title="Edit"><i data-lucide="edit-3" class="w-4 h-4"></i></button>
                        <button onclick="window.appMethods.deleteProduct('${product.id}')" class="p-1.5 text-slate-400 hover:text-red-500 active:bg-red-50 rounded-lg transition-colors" title="Delete"><i data-lucide="trash-2" class="w-4 h-4"></i></button>
                    </div>
                </div>`;
        });
        html += `</div>`;
    }

    html += `
                    </div>
                    
                    <div class="bg-slate-900 p-6 rounded-[2rem] text-white shadow-lg">
                         <h2 class="text-base font-extrabold mb-4 flex items-center gap-2"><i data-lucide="settings" class="w-5 h-5"></i> App Config</h2>
                         <form id="settings-form" class="space-y-4">
                            <div><label class="block text-xs font-bold text-slate-400 mb-1 ml-1">App Name</label><input type="text" id="set-app-name" value="${appSettings.name || ''}" class="w-full px-4 py-3 bg-slate-800 rounded-2xl border border-slate-700 text-white outline-none text-sm"></div>
                            
                            <div>
                                <label class="block text-xs font-bold text-slate-400 mb-1 ml-1">App Logo (Direct Upload)</label>
                                <input type="file" id="set-app-logo-file" accept="image/*" class="w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-700 file:text-white">
                            </div>

                            <div>
                                <label class="block text-xs font-bold text-slate-400 mb-1 ml-1">Home Banner Setting</label>
                                <select id="set-app-banner-type" class="w-full px-4 py-3 bg-slate-800 rounded-2xl border border-slate-700 text-white outline-none text-sm" onchange="document.getElementById('custom-banner-wrap').style.display = this.value === 'custom' ? 'block' : 'none'">
                                    <option value="default" ${appSettings.bannerType !== 'custom' ? 'selected' : ''}>Default Theme</option>
                                    <option value="custom" ${appSettings.bannerType === 'custom' ? 'selected' : ''}>Custom Upload Image</option>
                                </select>
                            </div>

                            <div id="custom-banner-wrap" style="display: ${appSettings.bannerType === 'custom' ? 'block' : 'none'};">
                                <label class="block text-xs font-bold text-slate-400 mb-1 ml-1">Home Ad Banner (Upload Landscape)</label>
                                <input type="file" id="set-app-banner" accept="image/*" class="w-full text-sm text-slate-400 file:mr-3 file:py-2 file:px-4 file:rounded-xl file:border-0 file:text-xs file:font-bold file:bg-slate-700 file:text-white">
                            </div>
                            
                            <button type="submit" id="settings-submit-btn" class="bg-white text-slate-900 text-sm font-bold py-3.5 rounded-2xl w-full mt-4 hover:bg-slate-100 transition-colors">Save Changes</button>
                         </form>
                    </div>
                </div>
            </div>

            ${getFooterHTML()}
        </div>`;
    return html;
}

// ==========================================
// 6. EVENT BINDING & APP RENDERER
// ==========================================
function renderApp() {
    renderHeader();
    renderBottomTabs();
    const mainContent = document.getElementById('main-content');
    if (!mainContent) return;
    mainContent.innerHTML = '';
    mainContent.scrollTop = 0;
    
    if (STATE.currentRoute === 'admin') {
        if (STATE.isAdminAuthenticated) { mainContent.innerHTML = getAdminDashboardScreen(); bindAdminEvents(); } 
        else { mainContent.innerHTML = getAdminLoginScreen(); bindLoginEvents(); }
    } else if (STATE.currentRoute === 'product') { mainContent.innerHTML = getProductDetailScreen(STATE.currentParam);
    } else if (STATE.currentRoute === 'cart') { mainContent.innerHTML = getCartScreen();
    } else if (STATE.currentRoute === 'checkout') { mainContent.innerHTML = getCheckoutScreen();
    } else if (STATE.currentRoute === 'courses') { mainContent.innerHTML = getMyCoursesScreen();
    } else if (STATE.currentRoute === 'profile') { mainContent.innerHTML = getProfileScreen();
    } else { mainContent.innerHTML = getStoreScreen(); }
    
    if (window.lucide) window.lucide.createIcons();
}

window.appMethods = {
    setThemeMode: (mode) => setThemeMode(mode),
    toggleCart: (productId) => {
        if (STATE.cart.includes(productId)) {
            window.appNavigate('cart');
        } else {
            STATE.cart.push(productId);
            localStorage.setItem('my_cart', JSON.stringify(STATE.cart));
            showToast("Added to Cart!", "success");
            renderHeader();
            window.appNavigate('cart');
        }
    },
    removeFromCart: (productId) => {
        STATE.cart = STATE.cart.filter(id => id !== productId);
        localStorage.setItem('my_cart', JSON.stringify(STATE.cart));
        renderApp();
    },
    startCheckout: (param) => {
        window.appNavigate('checkout', param);
    },
    processCheckout: () => {
        const name = document.getElementById('chk-name')?.value;
        const mobile = document.getElementById('chk-mobile')?.value;
        const email = document.getElementById('chk-email')?.value;
        const cls = document.getElementById('chk-class')?.value;

        if(!name || !mobile || !email || !cls) {
            showToast("Please fill all details", "error");
            return;
        }

        const mainItem = STATE.checkoutItems[0];
        
        if (mainItem && mainItem.paymentLink) {
            window.open(mainItem.paymentLink, '_blank');
            showToast("Opening Secure Gateway...", "info", 2000);
            
            setTimeout(() => { 
                if(confirm("DEMO Flow: Did you complete the payment successfully? (Adds to My Courses)")) { 
                    STATE.checkoutItems.forEach(item => {
                        if(!STATE.purchasedCourses.includes(item.id)) {
                            STATE.purchasedCourses.push(item.id);
                            window.appMethods.incrementPurchase(item.id);
                        }
                    });
                    localStorage.setItem('my_courses', JSON.stringify(STATE.purchasedCourses));
                    STATE.cart = [];
                    localStorage.setItem('my_cart', JSON.stringify(STATE.cart));
                    window.appNavigate('courses');
                    showToast("Course unlocked! Check 'My Courses'", "success", 4000);
                } 
            }, 2000);
        }
    },
    incrementPurchase: async (productId) => {
        if (!db) return;
        try {
            const productRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('products').doc(productId);
            const p = productsList.find(p => p.id === productId);
            if (p) await productRef.update({ purchases: (p.purchases || 0) + 1 });
        } catch (e) {}
    },
    logoutAdmin: () => { STATE.isAdminAuthenticated = false; window.appNavigate('profile'); },
    deleteProduct: async (productId) => {
        if (!confirm("Delete product?")) return;
        if (!db) return;
        try { 
            await db.collection('artifacts').doc(appId).collection('public').doc('data').collection('products').doc(productId).delete(); 
            showToast("Deleted"); 
        }
        catch (e) { showToast("Failed to delete", "error"); }
    },
    editProduct: (productId) => {
        const p = productsList.find(x => x.id === productId);
        if (!p) return;
        STATE.editingProductId = productId;
        document.getElementById('prod-title').value = p.title;
        document.getElementById('prod-desc').value = p.description;
        document.getElementById('prod-price').value = p.price;
        document.getElementById('prod-disc-price').value = p.discountedPrice;
        document.getElementById('prod-paylink').value = p.paymentLink;
        document.getElementById('prod-drive-link').value = p.driveLink;
        
        document.getElementById('form-title').innerHTML = '<i data-lucide="edit-3" class="w-6 h-6 text-indigo-600"></i> Edit Product';
        document.getElementById('submit-btn').innerHTML = '<i data-lucide="save" class="w-5 h-5"></i> Update Product';
        document.getElementById('cancel-edit-btn').classList.remove('hidden');
        document.getElementById('edit-img-note').classList.remove('hidden');
        
        window.appMethods.calculateDiscount();
        document.getElementById('main-content').scrollTo({ top: 0, behavior: 'smooth' });
        if (window.lucide) window.lucide.createIcons();
    },
    cancelEdit: () => {
        STATE.editingProductId = null;
        document.getElementById('add-product-form').reset();
        document.getElementById('form-title').innerHTML = '<i data-lucide="plus-circle" class="w-6 h-6 text-indigo-600"></i> Add Product';
        document.getElementById('submit-btn').innerHTML = '<i data-lucide="upload-cloud" class="w-5 h-5"></i> Publish Product';
        document.getElementById('cancel-edit-btn').classList.add('hidden');
        document.getElementById('edit-img-note').classList.add('hidden');
        document.getElementById('discount-badge').classList.add('hidden');
        if (window.lucide) window.lucide.createIcons();
    },
    calculateDiscount: () => {
        const orig = parseFloat(document.getElementById('prod-price').value);
        const disc = parseFloat(document.getElementById('prod-disc-price').value);
        const badge = document.getElementById('discount-badge');
        const val = document.getElementById('discount-val');
        if(orig > 0 && disc >= 0 && orig > disc) {
            const percent = Math.round(((orig - disc) / orig) * 100);
            val.innerText = percent;
            badge.classList.remove('hidden');
        } else { badge.classList.add('hidden'); }
    }
};

function bindLoginEvents() {
    const form = document.getElementById('admin-login-form');
    if (form) {
        form.addEventListener('submit', (e) => {
            e.preventDefault();
            const id = document.getElementById('admin-id').value.trim().toLowerCase();
            const pass = document.getElementById('admin-pass').value.trim();
            if (id === 'admin' && pass === 'password123') {
                STATE.isAdminAuthenticated = true;
                renderApp();
            } else { showToast("Invalid credentials", "error"); }
        });
    }
}

const processImageToBase64 = async (file, type = 'product') => {
    if (!file) return null;
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                try {
                    const canvas = document.createElement('canvas');
                    let MAX_DIM = 1080;
                    if (type === 'banner') MAX_DIM = 1920;
                    if (type === 'logo') MAX_DIM = 400; 
                    
                    let width = img.width;
                    let height = img.height;
                    
                    if (width > height) {
                        if (width > MAX_DIM) { height = Math.round((height * MAX_DIM) / width); width = MAX_DIM; }
                    } else {
                        if (height > MAX_DIM) { width = Math.round((width * MAX_DIM) / height); height = MAX_DIM; }
                    }
                    canvas.width = width;
                    canvas.height = height;
                    const ctx = canvas.getContext('2d');
                    ctx.drawImage(img, 0, 0, width, height);
                    
                    let quality = 0.90;
                    let base64String = canvas.toDataURL('image/jpeg', quality);
                    
                    while (base64String.length > 900000 && quality > 0.3) {
                        quality -= 0.1;
                        base64String = canvas.toDataURL('image/jpeg', quality);
                    }
                    if (base64String.length > 1000000) { reject(new Error("Image is too large for database.")); return; }
                    resolve(base64String);
                } catch (err) { reject(new Error("Image processing failed.")); }
            };
            img.onerror = () => reject(new Error("Invalid image format."));
            img.src = e.target.result;
        };
        reader.onerror = () => reject(new Error("Failed to read file."));
        reader.readAsDataURL(file);
    });
};

function bindAdminEvents() {
    const addForm = document.getElementById('add-product-form');
    if (addForm) {
        addForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            if (STATE.isUploading) return;
            const btn = document.getElementById('submit-btn');
            const originalBtnContent = btn.innerHTML;
            try {
                STATE.isUploading = true;
                btn.innerHTML = `<span class="loader loader-dark"></span> <span class="ml-2">Saving...</span>`;
                btn.disabled = true;
                
                const title = document.getElementById('prod-title').value;
                const desc = document.getElementById('prod-desc').value;
                const price = parseFloat(document.getElementById('prod-price').value);
                const discountedPrice = parseFloat(document.getElementById('prod-disc-price').value);
                const payLink = document.getElementById('prod-paylink').value;
                const driveLink = document.getElementById('prod-drive-link').value;
                const imageFile = document.getElementById('prod-image').files[0];
                
                let discountPercent = 0;
                if(price > 0 && discountedPrice < price) {
                    discountPercent = Math.round(((price - discountedPrice) / price) * 100);
                }

                let imageUrl = null;
                if (imageFile) imageUrl = await processImageToBase64(imageFile, 'product');
                
                const payload = {
                    title, description: desc, price, discountedPrice, discountPercent, paymentLink: payLink, driveLink
                };

                if (!db) throw new Error("Database not connected");

                if (STATE.editingProductId) {
                    if (imageUrl) payload.imageUrl = imageUrl;
                    const docRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('products').doc(STATE.editingProductId);
                    await docRef.update(payload);
                    showToast("Product Updated!", "success");
                    window.appMethods.cancelEdit(); 
                } else {
                    payload.imageUrl = imageUrl;
                    payload.purchases = 0;
                    payload.createdAt = new Date().toISOString();
                    
                    const collectionRef = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('products');
                    await collectionRef.add(payload);
                    showToast("Product Created!", "success"); 
                    addForm.reset(); 
                    document.getElementById('discount-badge').classList.add('hidden');
                }
            } catch (error) { 
                showToast(error.message || "Failed to save product", "error", 6000); 
            } finally { 
                STATE.isUploading = false; 
                btn.innerHTML = originalBtnContent; 
                btn.disabled = false; 
                if (window.lucide) window.lucide.createIcons();
            }
        });
    }
    
    const setForm = document.getElementById('settings-form');
    if (setForm) {
        setForm.addEventListener('submit', async (e) => {
            e.preventDefault();
            const btn = document.getElementById('settings-submit-btn');
            const origText = btn.innerHTML;
            try {
                btn.innerHTML = `<span class="loader loader-dark"></span>`;
                btn.disabled = true;

                const newName = document.getElementById('set-app-name').value;
                const logoFile = document.getElementById('set-app-logo-file').files[0];
                let newLogoUrl = appSettings.logoUrl;
                if (logoFile) newLogoUrl = await processImageToBase64(logoFile, 'logo');

                const bannerType = document.getElementById('set-app-banner-type').value;
                const bannerFile = document.getElementById('set-app-banner').files[0];
                let newBannerUrl = appSettings.bannerUrl;
                if (bannerFile) newBannerUrl = await processImageToBase64(bannerFile, 'banner');

                if (!db) throw new Error("Database not connected");

                const settingsDoc = db.collection('artifacts').doc(appId).collection('public').doc('data').collection('settings').doc('main');
                await settingsDoc.set({ 
                    name: newName, logoUrl: newLogoUrl, bannerType: bannerType, bannerUrl: newBannerUrl
                }, { merge: true });
                
                showToast("Config Saved!", "success");
            } catch (error) { showToast("Error saving settings", "error", 6000); 
            } finally { btn.innerHTML = origText; btn.disabled = false; }
        });
    }
}

window.addEventListener('DOMContentLoaded', async () => {
    // Apply theme & render UI immediately so screen is never blank!
    applyTheme();
    renderApp();

    const setHeight = () => document.body.style.height = window.innerHeight + 'px';
    window.addEventListener('resize', setHeight); 
    setHeight();

    if (auth) {
        await initAuth();
        auth.onAuthStateChanged((user) => {
            currentUser = user;
            if (user) setupDataListeners();
        });
    }
});
