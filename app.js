// Configuration de l'API
const API_BASE_URL = window.location.origin;

// Variables globales
let performanceChart = null;
let currentPeriod = 'today';
let currentUserRole = null;

// Fonction globale pour gérer les erreurs 401
function handle401(response) {
    if (response.status === 401) {
        console.error('❌ Session expirée - Redirection vers login');
        window.location.href = '/login';
        return true;
    }
    return false;
}

// Fonction pour formater les nombres
function formatNumber(num) {
    if (num === null || num === undefined) return '0';
    return new Intl.NumberFormat('fr-FR').format(num);
}

// Fonction pour formater la devise
function formatCurrency(amount) {
    if (amount === null || amount === undefined) return '$0.00';
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD'
    }).format(amount);
}

// Fonction pour convertir USD vers EUR
function convertUsdToEur(usdAmount) {
    const usdToEurRate = 0.92; // Taux approximatif
    return usdAmount * usdToEurRate;
}

// Fonction pour formater avec USD et EUR
function formatCurrencyWithEur(amount) {
    if (amount === null || amount === undefined) return '$0.00';
    const usdFormatted = formatCurrency(amount);
    const eurAmount = convertUsdToEur(amount);
    const eurFormatted = new Intl.NumberFormat('fr-FR', {
        style: 'currency',
        currency: 'EUR'
    }).format(eurAmount);
    return `${usdFormatted}<br><small style="color: var(--text-secondary); font-size: 0.65em; opacity: 0.7;">${eurFormatted}</small>`;
}

// Fonction pour formater la date
function formatDate(dateString) {
    if (!dateString) return '--';
    const date = new Date(dateString);
    return new Intl.DateTimeFormat('fr-FR', {
        day: '2-digit',
        month: '2-digit',
        year: 'numeric',
        hour: '2-digit',
        minute: '2-digit'
    }).format(date);
}

// Fonction pour mettre à jour l'heure de dernière mise à jour
function updateLastUpdate() {
    const now = new Date();
    const timeString = now.toLocaleTimeString('fr-FR', { 
        hour: '2-digit', 
        minute: '2-digit' 
    });
    document.getElementById('last-update').textContent = `Dernière mise à jour: ${timeString}`;
}

// Fonction pour afficher une erreur
function showError(message) {
    console.error(message);
    return `<div class="error-message">❌ ${message}</div>`;
}

// Fonction pour changer la période
function changePeriod(period) {
    currentPeriod = period;
    
    // Mettre à jour les boutons actifs
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    document.querySelector(`[data-period="${period}"]`).classList.add('active');
    
    // Recharger toutes les données
    refreshAllData();
}

// Fonction pour appliquer les dates personnalisées
function applyCustomDates() {
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;
    
    if (!dateFrom || !dateTo) {
        alert('Veuillez sélectionner les deux dates');
        return;
    }
    
    if (new Date(dateFrom) > new Date(dateTo)) {
        alert('La date de début doit être avant la date de fin');
        return;
    }
    
    // Désactiver tous les boutons de période
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Utiliser un format spécial pour les dates personnalisées
    currentPeriod = `custom:${dateFrom}:${dateTo}`;
    
    // Recharger toutes les données
    refreshAllData();
}

// Appliquer une période personnalisée
function applyCustomPeriod() {
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;
    
    if (!dateFrom || !dateTo) {
        alert('Veuillez sélectionner une date de début et une date de fin');
        return;
    }
    
    if (dateFrom > dateTo) {
        alert('La date de début doit être antérieure à la date de fin');
        return;
    }
    
    // Désactiver tous les boutons de période
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    // Utiliser le format custom:YYYY-MM-DD:YYYY-MM-DD
    currentPeriod = `custom:${dateFrom}:${dateTo}`;
    
    console.log(`📅 Période personnalisée appliquée: ${dateFrom} → ${dateTo}`);
    
    // Recharger toutes les données
    refreshAllData();
}

// Initialiser les dates par défaut
function initializeDatePickers() {
    const today = new Date();
    const lastWeek = new Date();
    lastWeek.setDate(lastWeek.getDate() - 7);
    
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    const dateFromEl = document.getElementById('date-from');
    const dateToEl = document.getElementById('date-to');
    
    if (dateFromEl && dateToEl) {
        dateFromEl.value = formatDate(lastWeek);
        dateToEl.value = formatDate(today);
    }
}

// 1. Charger les statistiques du dashboard
async function loadDashboardStats() {
    try {
        const timestamp = Date.now();
        const response = await fetch(`${API_BASE_URL}/api/stats?period=${currentPeriod}&_t=${timestamp}`);
        
        // Vérifier si la session a expiré
        if (handle401(response)) return;
        
        const data = await response.json();
        
        // Exemple de structure de données - adapter selon la réponse réelle de l'API
        const clicks = data.clicks || data.total_clicks || 0;
        const conversions = data.conversions || data.total_conversions || 0;
        const revenue = data.revenue || data.total_revenue || 0;
        const bonus = data.bonus || 0;
        const managerProfit = data.managerProfit || 0;
        
        // Calculer le profit net pour les affiliés (revenus + bonus)
        const netProfit = revenue + bonus;
        
        // Pour les managers, on garde le calcul original
        const totalCost = revenue + bonus;
        
        document.getElementById('total-clicks').textContent = formatNumber(clicks);
        document.getElementById('total-conversions').textContent = formatNumber(conversions);
        document.getElementById('total-revenue').innerHTML = formatCurrencyWithEur(revenue);
        document.getElementById('conversion-rate').innerHTML = formatCurrencyWithEur(bonus);
        
        // Afficher différemment selon le rôle
        if (currentUserRole === 'manager') {
            // Manager : Cacher les revenus, bonus et coût total
            const revenueCard = document.getElementById('revenue-card');
            const bonusCard = document.getElementById('bonus-card');
            const costCard = document.getElementById('cost-card');
            
            if (revenueCard) revenueCard.style.display = 'none';
            if (bonusCard) bonusCard.style.display = 'none';
            if (costCard) costCard.style.display = 'none';
            
            // Calculer et afficher le CA (leads × 30$)
            const caTotal = conversions * 30;
            const caCard = document.getElementById('ca-card');
            if (caCard) {
                caCard.style.display = 'flex';
                document.getElementById('ca-total').textContent = formatCurrency(caTotal);
            }
            
            // Afficher le profit du manager
            const managerProfitCard = document.getElementById('manager-profit-card');
            if (managerProfitCard) {
                managerProfitCard.style.display = 'flex';
                document.getElementById('manager-profit').innerHTML = formatCurrencyWithEur(managerProfit);
            }
            
            // Afficher la section leads par sub1 et la carte EPC
            const sub1LeadsSection = document.getElementById('sub1-leads-section');
            const epcCard = document.getElementById('epc-card');
            if (sub1LeadsSection) {
                sub1LeadsSection.style.display = 'block';
            }
            if (epcCard) {
                epcCard.style.display = 'flex';
            }
            
            
            // Charger les données spécifiques aux managers
            loadSub1Leads();
            loadManagerEPC();
        } else if (currentUserRole === 'submanager') {
            // Sous-manager : Afficher les stats avec commission
            const revenueCard = document.getElementById('revenue-card');
            const bonusCard = document.getElementById('bonus-card');
            const costCard = document.getElementById('cost-card');
            const caCard = document.getElementById('ca-card');
            const managerProfitCard = document.getElementById('manager-profit-card');
            const sub1LeadsSection = document.getElementById('sub1-leads-section');
            const epcCard = document.getElementById('epc-card');
            const profitNetCard = document.getElementById('profit-net-card');
            
            if (revenueCard) revenueCard.style.display = 'flex';
            if (bonusCard) bonusCard.style.display = 'flex';
            if (costCard) costCard.style.display = 'none'; // Cacher le coût total
            if (caCard) caCard.style.display = 'none';
            if (managerProfitCard) managerProfitCard.style.display = 'none';
            if (sub1LeadsSection) sub1LeadsSection.style.display = 'none';
            if (epcCard) epcCard.style.display = 'none';
            if (profitNetCard) profitNetCard.style.display = 'flex'; // AFFICHER PROFIT NET
            
            // CALCULER LE PROFIT NET : Revenue + Bonus + Commission Helper
            // On va le calculer après avoir chargé le Commission Helper
            window.submanagerRevenue = revenue;
            window.submanagerBonus = bonus;
        } else {
            // Affilié : Afficher toutes les cartes sauf profit manager et CA
            const revenueCard = document.getElementById('revenue-card');
            const bonusCard = document.getElementById('bonus-card');
            const costCard = document.getElementById('cost-card');
            const caCard = document.getElementById('ca-card');
            const managerProfitCard = document.getElementById('manager-profit-card');
            const sub1LeadsSection = document.getElementById('sub1-leads-section');
            const epcCard = document.getElementById('epc-card');
            
            const profitNetCard = document.getElementById('profit-net-card');
            
            if (revenueCard) revenueCard.style.display = 'flex';
            if (bonusCard) bonusCard.style.display = 'flex';
            if (costCard) costCard.style.display = 'flex';
            if (caCard) caCard.style.display = 'none';
            if (managerProfitCard) managerProfitCard.style.display = 'none';
            if (sub1LeadsSection) sub1LeadsSection.style.display = 'none';
            if (epcCard) epcCard.style.display = 'none';
            if (profitNetCard) profitNetCard.style.display = 'none'; // PAS DE PROFIT NET POUR AFFILIÉS SIMPLES
            
            // Profit Net = ce qu'il va recevoir (revenus + bonus)
            const costElement = document.getElementById('total-cost');
            if (costElement) {
                costElement.innerHTML = formatCurrencyWithEur(netProfit);
            }
        }
        
        updateLastUpdate();
    } catch (error) {
        console.error('Erreur lors du chargement des stats:', error);
        document.getElementById('total-clicks').innerHTML = '<span class="error-message">Erreur</span>';
        document.getElementById('total-conversions').innerHTML = '<span class="error-message">Erreur</span>';
        document.getElementById('total-revenue').innerHTML = '<span class="error-message">Erreur</span>';
        document.getElementById('conversion-rate').innerHTML = '<span class="error-message">Erreur</span>';
        document.getElementById('total-cost').innerHTML = '<span class="error-message">Erreur</span>';
    }
}

// 2. Charger les conversions récentes
async function loadConversions() {
    try {
        const timestamp = Date.now();
        const response = await fetch(`${API_BASE_URL}/api/conversions?period=${currentPeriod}&_t=${timestamp}`);
        const data = await response.json();
        
        const conversionsBody = document.getElementById('conversions-body');
        
        // Si pas de conversions
        if (!data || !data.conversions || data.conversions.length === 0) {
            conversionsBody.innerHTML = `
                <tr>
                    <td colspan="4" style="text-align: center; color: var(--text-light);">
                        Aucune conversion pour le moment
                    </td>
                </tr>
            `;
            return;
        }
        
        // Afficher les conversions
        conversionsBody.innerHTML = data.conversions.slice(0, 10).map(conversion => {
            const status = conversion.status || 'pending';
            const statusClass = `status-${status.toLowerCase()}`;
            const statusText = status === 'approved' ? 'Approuvé' : 
                             status === 'pending' ? 'En attente' : 'Rejeté';
            
            return `
                <tr>
                    <td>${formatDate(conversion.created_at || conversion.date)}</td>
                    <td><strong>${formatCurrency(conversion.payout || conversion.amount || 0)}</strong></td>
                    <td><span class="status-badge ${statusClass}">${statusText}</span></td>
                </tr>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Erreur lors du chargement des conversions:', error);
        document.getElementById('conversions-body').innerHTML = `
            <tr>
                <td colspan="3" class="loading-row">
                    ${showError('Impossible de charger les conversions')}
                </td>
            </tr>
        `;
    }
}

// 3. Charger les offres disponibles
async function loadOffers() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/offers?period=${currentPeriod}`);
        const data = await response.json();
        
        const offersGrid = document.getElementById('offers-grid');
        
        // Si pas d'offres
        if (!data || !data.offers || data.offers.length === 0) {
            offersGrid.innerHTML = `
                <div class="loading-message">
                    Aucune offre disponible pour le moment
                </div>
            `;
            return;
        }
        
        // Afficher les offres
        offersGrid.innerHTML = data.offers.map(offer => {
            const offerName = offer.name || offer.title || 'Offre sans nom';
            const payout = offer.payout || offer.default_payout || 0;
            const description = offer.description || 'Aucune description disponible';
            const trackingLink = offer.tracking_link || offer.url || '#';
            
            return `
                <div class="offer-card">
                    <h3>${offerName}</h3>
                    <div class="offer-payout">${formatCurrency(payout)}</div>
                    <p class="offer-description">${description.substring(0, 100)}${description.length > 100 ? '...' : ''}</p>
                    <a href="${trackingLink}" class="offer-link" target="_blank">
                        Obtenir le lien
                    </a>
                </div>
            `;
        }).join('');
        
    } catch (error) {
        console.error('Erreur lors du chargement des offres:', error);
        document.getElementById('offers-grid').innerHTML = 
            `<div class="loading-message">${showError('Impossible de charger les offres')}</div>`;
    }
}

// 4. Charger les données de performance et créer le graphique
async function loadPerformance() {
    try {
        const response = await fetch(`${API_BASE_URL}/api/performance?period=${currentPeriod}`);
        const data = await response.json();
        
        // Préparer les données pour le graphique
        let labels = [];
        let clicksData = [];
        let conversionsData = [];
        
        if (data && data.performance && Array.isArray(data.performance)) {
            data.performance.forEach(item => {
                labels.push(formatDate(item.date).split(' ')[0]); // Juste la date, pas l'heure
                clicksData.push(item.clicks || 0);
                conversionsData.push(item.conversions || 0);
            });
        } else {
            // Données de démonstration si pas de données
            const today = new Date();
            for (let i = 29; i >= 0; i--) {
                const date = new Date(today);
                date.setDate(date.getDate() - i);
                labels.push(date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
                clicksData.push(0);
                conversionsData.push(0);
            }
        }
        
        // Créer le graphique
        const ctx = document.getElementById('performanceChart').getContext('2d');
        
        if (performanceChart) {
            performanceChart.destroy();
        }
        
        performanceChart = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: 'Clicks',
                        data: clicksData,
                        borderColor: 'rgb(99, 102, 241)',
                        backgroundColor: 'rgba(99, 102, 241, 0.1)',
                        tension: 0.4,
                        fill: true
                    },
                    {
                        label: 'Conversions',
                        data: conversionsData,
                        borderColor: 'rgb(16, 185, 129)',
                        backgroundColor: 'rgba(16, 185, 129, 0.1)',
                        tension: 0.4,
                        fill: true
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: {
                        display: true,
                        position: 'top',
                    },
                    tooltip: {
                        mode: 'index',
                        intersect: false,
                    }
                },
                scales: {
                    y: {
                        beginAtZero: true,
                        ticks: {
                            precision: 0
                        }
                    }
                }
            }
        });
        
    } catch (error) {
        console.error('Erreur lors du chargement de la performance:', error);
        document.querySelector('.chart-container').innerHTML = 
            showError('Impossible de charger les données de performance');
    }
}

// 5. Charger le classement d'affiliés par leads (noms masqués)
async function loadLeaderboard() {
    try {
        const timestamp = Date.now();
        const response = await fetch(`${API_BASE_URL}/api/leaderboard?period=${currentPeriod}&_t=${timestamp}`);
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}`);
        }
        const data = await response.json();
        const tbody = document.getElementById('leaderboard-body');
        const list = (data && data.leaderboard) ? data.leaderboard.slice(0, 5) : [];
        if (list.length === 0) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" style="text-align:center; color: var(--text-light);">Aucun lead pour l'instant</td>
                </tr>
            `;
            return;
        }
        tbody.innerHTML = list.map(row => `
            <tr>
                <td>#${row.rank}</td>
                <td><strong>${row.nameMasked}</strong></td>
                <td>${formatNumber(row.leads)}</td>
            </tr>
        `).join('');
    } catch (error) {
        console.error('Erreur leaderboard:', error);
        const tbody = document.getElementById('leaderboard-body');
        if (tbody) {
            tbody.innerHTML = `
                <tr>
                    <td colspan="3" class="loading-row">${showError('Impossible de charger le classement')}</td>
                </tr>
            `;
        }
    }
}

// Fonction pour rafraîchir toutes les données
async function refreshAllData() {
    const promises = [
        loadDashboardStats(),
        loadConversions(),
        loadPerformance(),
        loadLeaderboard()
    ];
    
    // Ajouter le chargement des leads par sub1 si c'est un manager
    if (currentUserRole === 'manager') {
        promises.push(loadSub1Leads());
        promises.push(loadManagerEPC());
    }
    
    // Charger les bonus de l'utilisateur (pour tous les rôles)
    promises.push(loadUserBonuses());
    
    await Promise.all(promises);
}

// Fonction pour charger les bonus reçus par l'utilisateur
async function loadUserBonuses() {
    try {
        const timestamp = Date.now();
        
        const response = await fetch(`/api/user-bonuses?period=${currentPeriod}&_t=${timestamp}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        const commissionCard = document.getElementById('commission-helper-card');
        const totalBonusElement = document.getElementById('commission-helper-total');
        
        // Afficher la carte Commission Helper pour tous les sous-managers
        if (data.bonuses.length > 0 || currentUserRole === 'submanager') {
            commissionCard.style.display = 'block';
            
            // Afficher le total des bonus
            totalBonusElement.innerHTML = formatCurrencyWithEur(data.totalBonus);
            
            // CALCULER LE PROFIT NET : Revenue + Bonus + Commission Helper
            if (currentUserRole === 'submanager') {
                const revenue = window.submanagerRevenue || 0;
                const bonus = window.submanagerBonus || 0;
                const commissionHelper = data.totalBonus || 0;
                const profitNet = revenue + bonus + commissionHelper;
                
                const profitNetElement = document.getElementById('profit-net-total');
                if (profitNetElement) {
                    profitNetElement.innerHTML = formatCurrencyWithEur(profitNet);
                }
            }
        } else {
            // Masquer la carte si pas de bonus et pas sous-manager
            commissionCard.style.display = 'none';
        }
    } catch (error) {
        console.error('Erreur lors du chargement des bonus utilisateur:', error);
        document.getElementById('commission-helper-card').style.display = 'none';
    }
}

// Fonction logout
async function logout() {
    await fetch('/api/auth/logout', { method: 'POST' });
    window.location.href = '/login';
}

// Fonction pour charger les leads par sub1 pour les managers
async function loadSub1Leads() {
    // Vérifier que l'utilisateur est bien un manager
    if (currentUserRole !== 'manager') {
        return;
    }
    
    try {
        const timestamp = Date.now();
        const response = await fetch(`${API_BASE_URL}/api/sub1-leads?period=${currentPeriod}&_t=${timestamp}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        const tbody = document.getElementById('sub1-leads-body');
        
        if (!data || !data.sub1Leads || data.sub1Leads.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="7" style="text-align: center; color: var(--text-light);">
                    Aucun sub1 assigné
                </td>
            </tr>
        `;
            return;
        }
        
        tbody.innerHTML = data.sub1Leads.map(item => `
            <tr>
                <td><strong>${item.sub1}</strong></td>
                <td>${formatNumber(item.leads)}</td>
                <td style="text-align: center;">${formatCurrencyWithEur(item.costAffiliate)}</td>
                <td style="text-align: center;">${formatCurrencyWithEur(item.bonus)}</td>
                <td style="text-align: center; color: ${item.loshBonus > 0 ? 'var(--warning-color)' : 'var(--text-secondary)'};">
                    ${item.loshBonus > 0 ? formatCurrencyWithEur(item.loshBonus) : '-'}
                </td>
                <td style="text-align: center;">${formatCurrencyWithEur(item.net)}</td>
                <td style="color: ${item.epc > 0 ? 'var(--success-color)' : item.epc < 0 ? 'var(--danger-color)' : 'var(--text-secondary)'}; font-weight: 600; text-align: center;">
                    €${item.epc}
                </td>
            </tr>
        `).join('');
        
    } catch (error) {
        console.error('❌ Erreur lors du chargement des leads par sub1:', error);
        document.getElementById('sub1-leads-body').innerHTML = `
            <tr>
                <td colspan="7" class="loading-row">
                    ${showError('Impossible de charger les leads par sub1')}
                </td>
            </tr>
        `;
    }
}

// Fonction d'actualisation manuelle
async function manualRefresh() {
    const refreshBtn = document.getElementById('refresh-btn');
    
    // Désactiver le bouton
    refreshBtn.disabled = true;
    refreshBtn.textContent = '🔄 Actualisation...';
    
    try {
        await refreshAllData();
        // Message de succès
        refreshBtn.textContent = '✅ Mis à jour !';
        setTimeout(() => {
            refreshBtn.textContent = '🔄 Actualiser';
            refreshBtn.disabled = false;
        }, 1500);
    } catch (error) {
        // Message d'erreur
        refreshBtn.textContent = '❌ Erreur';
        setTimeout(() => {
            refreshBtn.textContent = '🔄 Actualiser';
            refreshBtn.disabled = false;
        }, 2000);
    }
}

// Charger l'utilisateur actuel
async function loadCurrentUser() {
    try {
        const response = await fetch('/api/auth/me');
        if (response.ok) {
            const user = await response.json();
            currentUserRole = user.role; // Stocker le rôle
            document.getElementById('user-name').textContent = `👤 ${user.name}`;
            
            // Ajouter lien admin si admin
            if (user.role === 'admin') {
                const adminLink = document.createElement('a');
                adminLink.href = '/admin';
                adminLink.textContent = '⚙️ Admin';
                adminLink.style.marginRight = '1rem';
                adminLink.style.color = 'white';
                adminLink.style.textDecoration = 'underline';
                document.getElementById('user-name').parentNode.insertBefore(adminLink, document.getElementById('user-name'));
            }
        } else {
            window.location.href = '/login';
        }
    } catch (error) {
        window.location.href = '/login';
    }
}

// Fonction pour charger l'EPC global du manager
async function loadManagerEPC() {
    // Vérifier que l'utilisateur est bien un manager
    if (currentUserRole !== 'manager') {
        return;
    }
    
    try {
        const timestamp = Date.now();
        const response = await fetch(`${API_BASE_URL}/api/manager-epc?period=${currentPeriod}&_t=${timestamp}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        
        // Afficher l'EPC dans la carte
        const epcElement = document.getElementById('global-epc');
        if (epcElement) {
            const eurAmount = convertUsdToEur(data.epc);
            const eurFormatted = new Intl.NumberFormat('fr-FR', {
                style: 'currency',
                currency: 'EUR'
            }).format(eurAmount);
            epcElement.innerHTML = `€${data.epc}<br><small style="color: var(--text-secondary); font-size: 0.65em; opacity: 0.7;">${eurFormatted}</small>`;
        }
        
    } catch (error) {
        console.error('❌ Erreur lors du chargement de l\'EPC:', error);
        const epcElement = document.getElementById('global-epc');
        if (epcElement) {
            epcElement.textContent = 'Erreur';
        }
    }
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', () => {
    // Ne pas charger si c'est une session demo
    const demoAuth = sessionStorage.getItem('demoAuth');
    if (demoAuth === 'true') {
        console.log('✅ Session demo détectée - app.js ne se charge pas');
        return;
    }
    
    initializeDatePickers();
    loadCurrentUser();
    refreshAllData();
    
    // Rafraîchir les données toutes les 1 minute
    setInterval(refreshAllData, 1 * 60 * 1000);
});
