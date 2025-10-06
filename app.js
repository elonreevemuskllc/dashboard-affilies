// Configuration de l'API
const API_BASE_URL = window.location.origin;

// Variables globales
let performanceChart = null;
let currentPeriod = 'today';
let currentUserRole = null;

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

// 1. Charger les statistiques du dashboard
async function loadDashboardStats() {
    try {
        console.log(`🔍 DEBUG - loadDashboardStats appelé (timestamp: ${Date.now()})`);
        const timestamp = Date.now();
        const response = await fetch(`${API_BASE_URL}/api/stats?period=${currentPeriod}&_t=${timestamp}`);
        const data = await response.json();
        console.log(`🔍 DEBUG - Data reçue:`, data);
        
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
        
        // Debug pour voir les valeurs
        console.log(`🔍 DEBUG - Revenue: $${revenue}, Bonus: $${bonus}, Net Profit: $${netProfit}`);
        
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
            
            if (revenueCard) revenueCard.style.display = 'flex';
            if (bonusCard) bonusCard.style.display = 'flex';
            if (costCard) costCard.style.display = 'none'; // Cacher le coût total
            if (caCard) caCard.style.display = 'none';
            if (managerProfitCard) managerProfitCard.style.display = 'flex';
            if (sub1LeadsSection) sub1LeadsSection.style.display = 'none';
            if (epcCard) epcCard.style.display = 'none';
            
            // Modifier le titre de la carte profit
            const profitCard = document.querySelector('#manager-profit-card .stat-content h3');
            if (profitCard) {
                profitCard.textContent = 'Profit Net';
            }
            
            // Afficher le profit net (avec commission déduite)
            if (data.netProfit !== undefined) {
                document.getElementById('manager-profit').innerHTML = formatCurrencyWithEur(data.netProfit);
            }
        } else {
            // Affilié : Afficher toutes les cartes sauf profit manager et CA
            const revenueCard = document.getElementById('revenue-card');
            const bonusCard = document.getElementById('bonus-card');
            const costCard = document.getElementById('cost-card');
            const caCard = document.getElementById('ca-card');
            const managerProfitCard = document.getElementById('manager-profit-card');
            const sub1LeadsSection = document.getElementById('sub1-leads-section');
            const epcCard = document.getElementById('epc-card');
            
            if (revenueCard) revenueCard.style.display = 'flex';
            if (bonusCard) bonusCard.style.display = 'flex';
            if (costCard) costCard.style.display = 'flex';
            if (caCard) caCard.style.display = 'none';
            if (managerProfitCard) managerProfitCard.style.display = 'none';
            if (sub1LeadsSection) sub1LeadsSection.style.display = 'none';
            if (epcCard) epcCard.style.display = 'none';
            
            
            // Profit Net = ce qu'il va recevoir (revenus + bonus)
            console.log(`🔍 DEBUG - Affichage Profit Net: ${netProfit}`);
            console.log(`🔍 DEBUG - Formatted: ${formatCurrencyWithEur(netProfit)}`);
            document.getElementById('total-cost').innerHTML = formatCurrencyWithEur(netProfit);
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

// Fonction pour rafraîchir toutes les données
async function refreshAllData() {
    const promises = [
        loadDashboardStats(),
        loadConversions(),
        loadPerformance()
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
        console.log('🔍 DEBUG - Loading user bonuses...');
        const timestamp = Date.now();
        const response = await fetch(`/api/user-bonuses?period=${currentPeriod}&_t=${timestamp}`);
        console.log('🔍 DEBUG - Response status:', response.status);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('🔍 DEBUG - User bonuses data:', data);
        console.log('🔍 DEBUG - Total bonus:', data.totalBonus);
        console.log('🔍 DEBUG - Bonuses array:', data.bonuses);
        console.log('🔍 DEBUG - First bonus details:', data.bonuses[0]);
        
        const commissionSection = document.getElementById('commission-helper-section');
        const totalBonusElement = document.getElementById('total-bonus-received');
        const bonusTableBody = document.getElementById('bonus-details-table');
        
        console.log('🔍 DEBUG - Commission section element:', commissionSection);
        console.log('🔍 DEBUG - Total bonus element:', totalBonusElement);
        console.log('🔍 DEBUG - Bonus table body:', bonusTableBody);
        
        if (data.totalBonus > 0) {
            // Afficher la section Commission Helper
            commissionSection.style.display = 'block';
            
            // Afficher le total des bonus
            totalBonusElement.innerHTML = formatCurrencyWithEur(data.totalBonus);
            
            // Afficher les détails des bonus
            if (data.bonuses.length > 0) {
                bonusTableBody.innerHTML = data.bonuses.map(bonus => `
                    <tr>
                        <td><strong>${bonus.sourceSub1}</strong></td>
                        <td style="text-align: center;">${formatNumber(bonus.leads)}</td>
                        <td style="text-align: center;">${formatCurrencyWithEur(bonus.bonusAmount)}</td>
                        <td style="text-align: center; color: var(--success-color); font-weight: 600;">
                            ${formatCurrencyWithEur(bonus.totalBonus)}
                        </td>
                    </tr>
                `).join('');
            } else {
                bonusTableBody.innerHTML = `
                    <tr>
                        <td colspan="4" style="text-align: center; color: var(--text-secondary);">
                            Aucun bonus reçu pour cette période
                        </td>
                    </tr>
                `;
            }
        } else {
            // Masquer la section si aucun bonus
            commissionSection.style.display = 'none';
        }
    } catch (error) {
        console.error('Erreur lors du chargement des bonus utilisateur:', error);
        document.getElementById('commission-helper-section').style.display = 'none';
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
        console.log('❌ loadSub1Leads appelé mais utilisateur n\'est pas manager:', currentUserRole);
        return;
    }
    
    try {
        console.log('🔍 Chargement des leads par sub1 pour manager...');
        const timestamp = Date.now();
        const response = await fetch(`${API_BASE_URL}/api/sub1-leads?period=${currentPeriod}&_t=${timestamp}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ Données reçues:', data);
        
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
        console.log('❌ loadManagerEPC appelé mais utilisateur n\'est pas manager:', currentUserRole);
        return;
    }
    
    try {
        console.log('🔍 Chargement de l\'EPC global pour manager...');
        const timestamp = Date.now();
        const response = await fetch(`${API_BASE_URL}/api/manager-epc?period=${currentPeriod}&_t=${timestamp}`);
        
        if (!response.ok) {
            throw new Error(`HTTP ${response.status}: ${response.statusText}`);
        }
        
        const data = await response.json();
        console.log('✅ EPC global récupéré:', data);
        
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
    console.log('🚀 Dashboard initialisé');
    loadCurrentUser();
    refreshAllData();
    
    // Rafraîchir les données toutes les 1 minute
    setInterval(refreshAllData, 1 * 60 * 1000);
});
