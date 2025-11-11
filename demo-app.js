// Configuration de l'API
const API_BASE_URL = window.location.origin;

// Variables globales
let performanceChart = null;
let demoData = null;

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

// 1. Charger les statistiques du dashboard
async function loadDashboardStats() {
    if (!demoData) return;
    
    const stats = demoData.stats;
    
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
    
    if (!demoData.conversions || demoData.conversions.length === 0) {
        conversionsBody.innerHTML = `
            <tr>
                <td colspan="4" style="text-align: center; color: var(--text-light);">
                    Aucune conversion pour le moment
                </td>
            </tr>
        `;
        return;
    }
    
    conversionsBody.innerHTML = demoData.conversions.map(conversion => {
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
    if (!demoData) return;
    
    const labels = [];
    const clicksData = [];
    const conversionsData = [];
    
    demoData.performance.forEach(item => {
        const date = new Date(item.date);
        labels.push(date.toLocaleDateString('fr-FR', { day: '2-digit', month: '2-digit' }));
        clicksData.push(item.clicks);
        conversionsData.push(item.conversions);
    });
    
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
    window.location.href = '/demo-login';
}

// Charger l'utilisateur
async function loadCurrentUser() {
    if (!demoData) return;
    document.getElementById('user-name').textContent = `👤 ${demoData.user.name} (DEMO)`;
}

// Initialisation au chargement de la page
document.addEventListener('DOMContentLoaded', async () => {
    // Vérifier l'authentification demo
    const demoAuth = sessionStorage.getItem('demoAuth');
    if (!demoAuth) {
        window.location.href = '/demo-login';
        return;
    }
    
    await loadDemoData();
    loadCurrentUser();
    refreshAllData();
    
    // Rafraîchir les données toutes les 5 minutes (pour l'animation)
    setInterval(refreshAllData, 5 * 60 * 1000);
});

