// Configuration de l'API
const API_BASE_URL = window.location.origin;

// Variables globales
let performanceChart = null;
let demoData = null;
let currentPeriod = 'today';

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
    const usdToEurRate = 0.92;
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

// Charger les données de démo
async function loadDemoData() {
    try {
        const response = await fetch('/demo-data.json');
        demoData = await response.json();
        console.log('✅ Demo data loaded:', demoData);
    } catch (error) {
        console.error('❌ Error loading demo data:', error);
    }
}

// Obtenir les dates selon la période
function getDateRange(period) {
    const today = new Date();
    let startDate, endDate;
    
    switch(period) {
        case 'yesterday':
            startDate = new Date(today);
            startDate.setDate(startDate.getDate() - 1);
            endDate = new Date(startDate);
            break;
        case 'today':
        default:
            startDate = new Date(today);
            endDate = new Date(today);
            break;
    }
    
    return { startDate, endDate };
}

// Calculer les stats pour une période
function calculateStatsForPeriod(period) {
    if (!demoData || !demoData.dailyStats) return null;
    
    const { startDate, endDate } = getDateRange(period);
    
    // Format YYYY-MM-DD
    const formatDate = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    let totalClicks = 0;
    let totalConversions = 0;
    let totalRevenue = 0;
    let totalBonus = 0;
    
    // Itérer sur chaque jour dans la période
    const currentDate = new Date(startDate);
    while (currentDate <= endDate) {
        const dateKey = formatDate(currentDate);
        const dayData = demoData.dailyStats[dateKey];
        
        if (dayData) {
            totalClicks += dayData.clicks;
            totalConversions += dayData.conversions;
            totalRevenue += dayData.revenue;
            totalBonus += dayData.bonus;
        }
        
        currentDate.setDate(currentDate.getDate() + 1);
    }
    
    return {
        clicks: totalClicks,
        conversions: totalConversions,
        revenue: totalRevenue,
        bonus: totalBonus
    };
}

// 1. Charger les statistiques du dashboard
async function loadDashboardStats() {
    if (!demoData) return;
    
    // Calculer les stats selon la période sélectionnée
    const stats = calculateStatsForPeriod(currentPeriod);
    if (!stats) return;
    
    document.getElementById('total-clicks').textContent = formatNumber(stats.clicks);
    document.getElementById('total-conversions').textContent = formatNumber(stats.conversions);
    document.getElementById('total-revenue').innerHTML = formatCurrencyWithEur(stats.revenue);
    document.getElementById('conversion-rate').innerHTML = formatCurrencyWithEur(stats.bonus);
    
    // Calculer le profit net en EUR
    const netProfitUSD = stats.revenue + stats.bonus;
    const netProfitEUR = convertUsdToEur(netProfitUSD);
    const costElement = document.getElementById('total-cost');
    if (costElement) {
        const eurFormatted = new Intl.NumberFormat('fr-FR', {
            style: 'currency',
            currency: 'EUR'
        }).format(netProfitEUR);
        costElement.innerHTML = `${eurFormatted}<br><small style="color: var(--text-secondary); font-size: 0.65em; opacity: 0.7;">${formatCurrency(netProfitUSD)}</small>`;
    }
    
    updateLastUpdate();
}

// 2. Charger les conversions récentes
async function loadConversions() {
    if (!demoData) return;
    
    const conversionsBody = document.getElementById('conversions-body');
    
    // Générer les conversions selon la période
    const { startDate } = getDateRange(currentPeriod);
    const formatDateKey = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    const conversions = [];
    if (demoData.conversionsTemplates) {
        demoData.conversionsTemplates.forEach(template => {
            const dateKey = formatDateKey(startDate);
            const dateTimeStr = `${dateKey}T${template.time}.000Z`;
            
            conversions.push({
                created_at: dateTimeStr,
                payout: template.payout,
                status: template.status
            });
        });
    }
    
    if (conversions.length === 0) {
        conversionsBody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align: center; color: var(--text-light);">
                    Aucune conversion pour le moment
                </td>
            </tr>
        `;
        return;
    }
    
    conversionsBody.innerHTML = conversions.map(conversion => {
        const status = conversion.status || 'pending';
        const statusClass = `status-${status.toLowerCase()}`;
        const statusText = status === 'approved' ? 'Approuvé' : 
                         status === 'pending' ? 'En attente' : 'Rejeté';
        
        return `
            <tr>
                <td>${formatDate(conversion.created_at)}</td>
                <td><strong>${formatCurrency(conversion.payout)}</strong></td>
                <td><span class="status-badge ${statusClass}">${statusText}</span></td>
            </tr>
        `;
    }).join('');
}

// 3. Charger les données de performance et créer le graphique
async function loadPerformance() {
    if (!demoData || !demoData.dailyStats) return;
    
    const labels = [];
    const clicksData = [];
    const conversionsData = [];
    
    // Obtenir les 30 derniers jours
    const today = new Date();
    const formatDateKey = (date) => {
        const year = date.getFullYear();
        const month = String(date.getMonth() + 1).padStart(2, '0');
        const day = String(date.getDate()).padStart(2, '0');
        return `${year}-${month}-${day}`;
    };
    
    // Créer les données pour les 30 derniers jours
    for (let i = 29; i >= 0; i--) {
        const date = new Date(today);
        date.setDate(date.getDate() - i);
        const dateKey = formatDateKey(date);
        
        labels.push(date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
        
        const dayData = demoData.dailyStats[dateKey];
        if (dayData) {
            clicksData.push(dayData.clicks);
            conversionsData.push(dayData.conversions);
        } else {
            clicksData.push(0);
            conversionsData.push(0);
        }
    }
    
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
}

// 4. Charger le classement
async function loadLeaderboard() {
    if (!demoData) return;
    
    const tbody = document.getElementById('leaderboard-body');
    
    if (!demoData.leaderboard || demoData.leaderboard.length === 0) {
        tbody.innerHTML = `
            <tr>
                <td colspan="3" style="text-align:center; color: var(--text-light);">Aucun lead pour l'instant</td>
            </tr>
        `;
        return;
    }
    
    tbody.innerHTML = demoData.leaderboard.map(row => `
        <tr>
            <td>#${row.rank}</td>
            <td><strong>${row.nameMasked}</strong></td>
            <td>${formatNumber(row.leads)}</td>
        </tr>
    `).join('');
}

// Fonction pour changer la période
function changePeriod(period) {
    currentPeriod = period;
    
    // Mettre à jour les boutons actifs
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    const btn = document.querySelector(`[data-period="${period}"]`);
    if (btn) {
        btn.classList.add('active');
    }
    
    // Recharger les données pour la nouvelle période
    refreshAllData();
}

// Fonction pour appliquer les dates personnalisées (non-fonctionnelle en demo)
function applyCustomDates() {
    const dateFrom = document.getElementById('date-from').value;
    const dateTo = document.getElementById('date-to').value;
    
    if (!dateFrom || !dateTo) {
        alert('Veuillez sélectionner les deux dates');
        return;
    }
    
    // Désactiver tous les boutons de période
    document.querySelectorAll('.period-btn').forEach(btn => {
        btn.classList.remove('active');
    });
    
    console.log(`Dates personnalisées en mode demo: ${dateFrom} → ${dateTo}`);
}

// Fonction pour appliquer une période personnalisée
function applyCustomPeriod() {
    applyCustomDates();
}

// Fonction d'actualisation manuelle (recharge les données demo)
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

// Fonction pour rafraîchir toutes les données
async function refreshAllData() {
    await loadDemoData();
    await Promise.all([
        loadDashboardStats(),
        loadConversions(),
        loadPerformance(),
        loadLeaderboard()
    ]);
}

// Fonction logout (retour à la page normale)
async function logout() {
    sessionStorage.removeItem('demoAuth');
    sessionStorage.removeItem('demoEmail');
    window.location.href = '/login';
}

// Charger l'utilisateur
async function loadCurrentUser() {
    if (!demoData) return;
    
    // Récupérer l'email depuis sessionStorage
    const email = sessionStorage.getItem('demoEmail') || 'demo@aprileads.com';
    
    // Extraire le prénom de l'email (ex: alex.martin@yopmail.com → Alex)
    const username = email.split('@')[0];
    const firstName = username.split('.')[0];
    const displayName = firstName.charAt(0).toUpperCase() + firstName.slice(1);
    
    document.getElementById('user-name').textContent = `👤 ${displayName}`;
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', async () => {
    // Vérifier l'authentification demo (ne pas rediriger, juste ne pas charger)
    const demoAuth = sessionStorage.getItem('demoAuth');
    if (!demoAuth || demoAuth !== 'true') {
        console.log('❌ Pas de session demo détectée');
        return;
    }
    
    initializeDatePickers();
    await loadDemoData();
    loadCurrentUser();
    refreshAllData();
    
    // Rafraîchir les données toutes les 5 minutes (pour l'animation)
    setInterval(refreshAllData, 5 * 60 * 1000);
});

