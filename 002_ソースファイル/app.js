// 家計管理アプリ
class FinanceApp {
    constructor() {
        this.accounts = [];
        this.plCategories = { income: [], expenses: [], reference: [] };
        this.monthlyRecords = [];
        this.loanOriginalBalance = null;
        this.loanInterestRate = 8.0;
        this.loanMonthlyRepayment = null;
        this.directoryHandle = null;
        this.charts = {};
        // 新機能用プロパティ
        this.isDirty = false;
        this.lastSavedAt = null;
        this.budgets = {};      // { categoryId: amount }
        this.goals = [];        // [{ id, name, type, targetAmount, targetDate }]
        this.init();
    }

    // ======================================
    // 初期化
    // ======================================
    init() {
        this.initDefaultData();
        this.setupEventListeners();
        this.initDashboardDateSelectors();
        this.initDetailDateSelectors();
        this.initInputDateSelectors();
        this.initYearlyDateSelector();
        this.loadDataFromFile();
    }

    initDefaultData() {
        this.accounts = [
            { id: 'rakuten', name: '楽天銀行', type: 'asset', icon: '🏦' },
            { id: 'mizuho', name: 'みずほ銀行', type: 'asset', icon: '🏦' },
            { id: 'yucho', name: 'ゆうちょ銀行', type: 'asset', icon: '🏦' },
            { id: 'gmo_aozora', name: 'GMOあおぞら（法人）', type: 'asset', icon: '🏢' },
            { id: 'smbc_loan', name: '三井住友カードローン', type: 'liability', icon: '💳' },
            { id: 'credit_unpaid', name: 'クレカ未払残高', type: 'liability', icon: '💳' }
        ];

        this.plCategories = {
            income: [{ id: 'officer_salary', name: '役員報酬', icon: '💼', desc: '' }],
            expenses: [
                { id: 'living_fixed', name: '生活固定費', icon: '🏠', desc: '家賃+光熱費+通信費' },
                { id: 'credit_usage', name: 'クレカ利用額', icon: '💳', desc: '' },
                { id: 'ccagi', name: 'CCAGI支払', icon: '🏢', desc: '法人経費（一人法人）' }
            ],
            reference: []
        };

        this.loanInterestRate = 8.0;

        // 初期データ: 2026年2月
        this.monthlyRecords = [
            {
                yearMonth: '2026-02',
                recordedAt: '2026-02-28T15:30:00Z',
                bs: {
                    rakuten: 437468, mizuho: 40836, yucho: 24150, gmo_aozora: 0,
                    smbc_loan: 3466152, credit_unpaid: 0
                },
                pl: {
                    officer_salary: 0, living_fixed: 104000, credit_usage: 0, ccagi: 660000
                },
                memo: 'CCAGI初回支払い 660,000円（税込）。確定申告準備中。'
            }
        ];
    }

    // ======================================
    // イベントリスナー
    // ======================================
    setupEventListeners() {
        // タブ切り替え
        document.querySelectorAll('.tab-button').forEach(btn => {
            btn.addEventListener('click', (e) => this.switchTab(e.target.dataset.tab));
        });

        // ファイル操作
        document.getElementById('save-data').addEventListener('click', () => this.saveDataToFile());
        document.getElementById('load-data').addEventListener('click', () => this.reloadLatestData());
        document.getElementById('export-csv').addEventListener('click', () => this.exportToCSV());

        // ダッシュボード月選択
        document.getElementById('dashboard-year').addEventListener('change', () => this.renderDashboard());
        document.getElementById('dashboard-month').addEventListener('change', () => this.renderDashboard());

        // 月次入力
        document.getElementById('input-year').addEventListener('change', () => this.onInputDateChange());
        document.getElementById('input-month').addEventListener('change', () => this.onInputDateChange());
        document.getElementById('copy-previous').addEventListener('click', () => this.copyFromPreviousMonth());
        document.getElementById('save-monthly').addEventListener('click', () => this.saveMonthlyData());

        // BS・PL詳細月選択
        document.getElementById('bs-detail-year').addEventListener('change', () => this.renderBSDetail());
        document.getElementById('bs-detail-month').addEventListener('change', () => this.renderBSDetail());
        document.getElementById('pl-detail-year').addEventListener('change', () => this.renderPLDetail());
        document.getElementById('pl-detail-month').addEventListener('change', () => this.renderPLDetail());

        // 推移グラフフィルター
        document.getElementById('chart-range').addEventListener('change', () => this.renderCharts());

        // 設定
        document.getElementById('save-loan-settings').addEventListener('click', () => this.saveLoanSettings());
        document.getElementById('add-account').addEventListener('click', () => this.addAccount());
        document.getElementById('add-category').addEventListener('click', () => this.addCategory());
        document.getElementById('save-budget-settings').addEventListener('click', () => this.saveBudgetSettings());
        document.getElementById('add-goal').addEventListener('click', () => this.addGoal());

        // A1: 月ナビゲーション
        document.getElementById('dashboard-prev').addEventListener('click', () => this.navigateMonth('dashboard', -1));
        document.getElementById('dashboard-next').addEventListener('click', () => this.navigateMonth('dashboard', 1));
        document.getElementById('bs-prev').addEventListener('click', () => this.navigateMonth('bs-detail', -1));
        document.getElementById('bs-next').addEventListener('click', () => this.navigateMonth('bs-detail', 1));
        document.getElementById('pl-prev').addEventListener('click', () => this.navigateMonth('pl-detail', -1));
        document.getElementById('pl-next').addEventListener('click', () => this.navigateMonth('pl-detail', 1));
        document.getElementById('input-prev').addEventListener('click', () => this.navigateMonth('input', -1));
        document.getElementById('input-next').addEventListener('click', () => this.navigateMonth('input', 1));

        // 年間サマリー
        document.getElementById('yearly-year').addEventListener('change', () => this.renderYearlySummary());
        document.getElementById('compare-btn').addEventListener('click', () => this.renderComparison());

        // A2: 離脱警告
        window.addEventListener('beforeunload', (e) => {
            if (this.isDirty) {
                e.preventDefault();
                e.returnValue = '';
            }
        });
    }

    switchTab(tabName) {
        document.querySelectorAll('.tab-button').forEach(btn => btn.classList.remove('active'));
        document.querySelectorAll('.tab-content').forEach(tab => tab.classList.remove('active'));

        document.querySelector(`[data-tab="${tabName}"]`).classList.add('active');
        document.getElementById(`${tabName}-tab`).classList.add('active');

        // タブ切り替え時に描画
        if (tabName === 'dashboard') this.renderDashboard();
        if (tabName === 'bs-detail') this.renderBSDetail();
        if (tabName === 'pl-detail') this.renderPLDetail();
        if (tabName === 'input') this.renderInputForm();
        if (tabName === 'charts') this.renderCharts();
        if (tabName === 'yearly') this.renderYearlySummary();
        if (tabName === 'settings') this.renderSettings();
    }

    // ======================================
    // ステータスメッセージ
    // ======================================
    showStatus(type, icon, message) {
        const statusDiv = document.getElementById('data-status');
        statusDiv.className = `data-status ${type}`;
        statusDiv.innerHTML = `<span class="data-status-icon">${icon}</span><span>${message}</span>`;
    }

    // ======================================
    // File System Access API（既存アプリと同パターン）
    // ======================================
    async loadDataFromFile() {
        try {
            if (!('showDirectoryPicker' in window)) {
                this.showStatus('info', 'ℹ️', 'このブラウザはFile System Access APIに非対応です。Chrome、Edgeなどをご利用ください。');
                this.renderDashboard();
                return;
            }

            try {
                this.directoryHandle = await this.getStoredDirectoryHandle();
                const permission = await this.directoryHandle.queryPermission({ mode: 'read' });
                if (permission === 'granted') {
                    await this.loadLatestDataFile();
                } else {
                    const newPermission = await this.directoryHandle.requestPermission({ mode: 'read' });
                    if (newPermission === 'granted') {
                        await this.loadLatestDataFile();
                    } else {
                        this.showStatus('warning', '⚠️', 'フォルダへのアクセスが許可されませんでした。「🔄 最新データを読み込み」ボタンをクリックしてください。');
                    }
                }
            } catch (error) {
                this.showStatus('info', '📂', '「🔄 最新データを読み込み」ボタンをクリックして、001_データフォルダを選択してください。');
            }
        } catch (error) {
            this.showStatus('error', '❌', `エラー: ${error.message}`);
        }

        this.renderDashboard();
    }

    async loadLatestDataFile() {
        try {
            const files = [];
            for await (const entry of this.directoryHandle.values()) {
                if (entry.kind === 'file' && entry.name.endsWith('.json')) {
                    const fileHandle = await this.directoryHandle.getFileHandle(entry.name);
                    const file = await fileHandle.getFile();
                    files.push({ name: entry.name, handle: fileHandle, lastModified: file.lastModified });
                }
            }

            if (files.length === 0) {
                this.showStatus('warning', '⚠️', 'データファイルが見つかりません。初期データで開始します。');
                return;
            }

            files.sort((a, b) => b.lastModified - a.lastModified);
            const file = await files[0].handle.getFile();
            const text = await file.text();
            const data = JSON.parse(text);

            this.loadFromJSON(data);

            const recordCount = this.monthlyRecords.length;
            this.showStatus('success', '✅', `データを読み込みました: ${files[0].name} (${recordCount}ヶ月分)`);
        } catch (error) {
            this.showStatus('error', '❌', `ファイル読み込みエラー: ${error.message}`);
        }
    }

    loadFromJSON(data) {
        if (data.accounts && data.accounts.length > 0) this.accounts = data.accounts;
        if (data.plCategories) this.plCategories = data.plCategories;
        if (data.monthlyRecords) this.monthlyRecords = data.monthlyRecords;
        if (data.loanOriginalBalance !== undefined) this.loanOriginalBalance = data.loanOriginalBalance;
        if (data.loanInterestRate !== undefined) this.loanInterestRate = data.loanInterestRate;
        if (data.loanMonthlyRepayment !== undefined) this.loanMonthlyRepayment = data.loanMonthlyRepayment;
        if (data.budgets) this.budgets = data.budgets;
        if (data.goals) this.goals = data.goals;
        this.isDirty = false;
    }

    toJSON() {
        return {
            version: '1.1',
            accounts: this.accounts,
            plCategories: this.plCategories,
            loanOriginalBalance: this.loanOriginalBalance,
            loanInterestRate: this.loanInterestRate,
            loanMonthlyRepayment: this.loanMonthlyRepayment,
            monthlyRecords: this.monthlyRecords,
            budgets: this.budgets,
            goals: this.goals
        };
    }

    async saveDataToFile() {
        try {
            if (!('showDirectoryPicker' in window)) {
                alert('このブラウザはFile System Access APIに対応していません。\nChrome、EdgeなどのChromiumベースのブラウザをご利用ください。');
                return;
            }

            if (!this.directoryHandle) {
                try {
                    this.directoryHandle = await window.showDirectoryPicker({ mode: 'readwrite', startIn: 'documents' });
                    await this.storeDirectoryHandle(this.directoryHandle);
                    alert('001_データフォルダを選択しました。\n次回からこのフォルダに自動保存されます。');
                } catch (error) {
                    if (error.name === 'AbortError') { alert('フォルダの選択がキャンセルされました'); return; }
                    throw error;
                }
            }

            const now = new Date();
            const timestamp = now.getFullYear()
                + String(now.getMonth() + 1).padStart(2, '0')
                + String(now.getDate()).padStart(2, '0')
                + '_'
                + String(now.getHours()).padStart(2, '0')
                + String(now.getMinutes()).padStart(2, '0')
                + String(now.getSeconds()).padStart(2, '0');
            const filename = `finance_${timestamp}.json`;

            const fileHandle = await this.directoryHandle.getFileHandle(filename, { create: true });
            const writable = await fileHandle.createWritable();
            await writable.write(JSON.stringify(this.toJSON(), null, 2));
            await writable.close();

            this.isDirty = false;
            this.lastSavedAt = new Date();
            this.updateSaveStatus();
            this.showStatus('success', '✅', `${filename} を保存しました！`);
        } catch (error) {
            console.error('保存エラー:', error);
            this.showStatus('error', '❌', `保存中にエラーが発生しました: ${error.message}`);
        }
    }

    async reloadLatestData() {
        try {
            const dirHandle = await window.showDirectoryPicker({ mode: 'read', startIn: 'desktop' });
            this.directoryHandle = dirHandle;
            await this.storeDirectoryHandle(dirHandle);
            await this.loadLatestDataFile();
            this.renderDashboard();
        } catch (error) {
            if (error.name !== 'AbortError') {
                this.showStatus('error', '❌', `読み込みエラー: ${error.message}`);
            }
        }
    }

    async getStoredDirectoryHandle() {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['directories'], 'readonly');
            const store = tx.objectStore('directories');
            const request = store.get('dataDirectory');
            request.onsuccess = () => {
                if (request.result) resolve(request.result.handle);
                else reject(new Error('ハンドルが見つかりません'));
            };
            request.onerror = () => reject(request.error);
        });
    }

    async openDB() {
        return new Promise((resolve, reject) => {
            const request = indexedDB.open('FinanceAppDB', 1);
            request.onerror = () => reject(request.error);
            request.onsuccess = () => resolve(request.result);
            request.onupgradeneeded = (event) => {
                const db = event.target.result;
                if (!db.objectStoreNames.contains('directories')) {
                    db.createObjectStore('directories');
                }
            };
        });
    }

    async storeDirectoryHandle(handle) {
        const db = await this.openDB();
        return new Promise((resolve, reject) => {
            const tx = db.transaction(['directories'], 'readwrite');
            const store = tx.objectStore('directories');
            const request = store.put({ handle: handle }, 'dataDirectory');
            request.onsuccess = () => resolve();
            request.onerror = () => reject(request.error);
        });
    }

    // ======================================
    // 日付セレクター初期化
    // ======================================
    initDashboardDateSelectors() {
        const yearSel = document.getElementById('dashboard-year');
        const monthSel = document.getElementById('dashboard-month');
        const now = new Date();
        const curYear = now.getFullYear();

        for (let y = curYear - 3; y <= curYear + 1; y++) {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = `${y}年`;
            if (y === curYear) opt.selected = true;
            yearSel.appendChild(opt);
        }
        for (let m = 1; m <= 12; m++) {
            const opt = document.createElement('option');
            opt.value = m; opt.textContent = `${m}月`;
            if (m === now.getMonth() + 1) opt.selected = true;
            monthSel.appendChild(opt);
        }
    }

    initDetailDateSelectors() {
        const ids = [
            { yearId: 'bs-detail-year', monthId: 'bs-detail-month' },
            { yearId: 'pl-detail-year', monthId: 'pl-detail-month' }
        ];
        const now = new Date();
        const curYear = now.getFullYear();

        ids.forEach(({ yearId, monthId }) => {
            const yearSel = document.getElementById(yearId);
            const monthSel = document.getElementById(monthId);
            for (let y = curYear - 3; y <= curYear + 1; y++) {
                const opt = document.createElement('option');
                opt.value = y; opt.textContent = `${y}年`;
                if (y === curYear) opt.selected = true;
                yearSel.appendChild(opt);
            }
            for (let m = 1; m <= 12; m++) {
                const opt = document.createElement('option');
                opt.value = m; opt.textContent = `${m}月`;
                if (m === now.getMonth() + 1) opt.selected = true;
                monthSel.appendChild(opt);
            }
        });
    }

    initInputDateSelectors() {
        const yearSel = document.getElementById('input-year');
        const monthSel = document.getElementById('input-month');
        const now = new Date();
        const curYear = now.getFullYear();

        for (let y = curYear - 3; y <= curYear + 1; y++) {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = `${y}年`;
            if (y === curYear) opt.selected = true;
            yearSel.appendChild(opt);
        }
        for (let m = 1; m <= 12; m++) {
            const opt = document.createElement('option');
            opt.value = m; opt.textContent = `${m}月`;
            if (m === now.getMonth() + 1) opt.selected = true;
            monthSel.appendChild(opt);
        }
    }

    // ======================================
    // ユーティリティ
    // ======================================
    formatCurrency(amount) {
        if (amount === null || amount === undefined) return '--';
        const abs = Math.abs(amount);
        const formatted = '¥' + abs.toLocaleString('ja-JP');
        return amount < 0 ? `▲${formatted}` : formatted;
    }

    formatDelta(current, previous) {
        if (previous === null || previous === undefined) return { text: '', cls: 'flat' };
        const diff = current - previous;
        if (diff > 0) return { text: `↑ +¥${diff.toLocaleString('ja-JP')}`, cls: 'up' };
        if (diff < 0) return { text: `↓ ▲¥${Math.abs(diff).toLocaleString('ja-JP')}`, cls: 'down' };
        return { text: '→ ±0', cls: 'flat' };
    }

    getSelectedDashboardYearMonth() {
        const y = document.getElementById('dashboard-year').value;
        const m = String(document.getElementById('dashboard-month').value).padStart(2, '0');
        return `${y}-${m}`;
    }

    getSelectedInputYearMonth() {
        const y = document.getElementById('input-year').value;
        const m = String(document.getElementById('input-month').value).padStart(2, '0');
        return `${y}-${m}`;
    }

    getRecord(yearMonth) {
        return this.monthlyRecords.find(r => r.yearMonth === yearMonth) || null;
    }

    getPreviousYearMonth(yearMonth) {
        const [y, m] = yearMonth.split('-').map(Number);
        const prevMonth = m === 1 ? 12 : m - 1;
        const prevYear = m === 1 ? y - 1 : y;
        return `${prevYear}-${String(prevMonth).padStart(2, '0')}`;
    }

    getPreviousRecord(yearMonth) {
        return this.getRecord(this.getPreviousYearMonth(yearMonth));
    }

    getSortedRecords() {
        return [...this.monthlyRecords].sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));
    }

    calcTotals(record) {
        if (!record) return { totalAssets: 0, totalLiabilities: 0, netWorth: 0, totalIncome: 0, totalExpenses: 0, monthlyCashFlow: 0, totalReference: 0 };

        const assets = this.accounts.filter(a => a.type === 'asset');
        const liabilities = this.accounts.filter(a => a.type === 'liability');

        const totalAssets = assets.reduce((sum, a) => sum + (record.bs[a.id] || 0), 0);
        const totalLiabilities = liabilities.reduce((sum, a) => sum + (record.bs[a.id] || 0), 0);
        const netWorth = totalAssets - totalLiabilities;

        const totalIncome = this.plCategories.income.reduce((sum, c) => sum + (record.pl[c.id] || 0), 0);
        const totalExpenses = this.plCategories.expenses.reduce((sum, c) => sum + (record.pl[c.id] || 0), 0);
        const monthlyCashFlow = totalIncome - totalExpenses;

        const totalReference = this.plCategories.reference.reduce((sum, c) => sum + (record.pl[c.id] || 0), 0);

        return { totalAssets, totalLiabilities, netWorth, totalIncome, totalExpenses, monthlyCashFlow, totalReference };
    }

    // ======================================
    // ダッシュボード描画
    // ======================================
    renderDashboard() {
        const yearMonth = this.getSelectedDashboardYearMonth();
        const record = this.getRecord(yearMonth);
        const prevRecord = this.getPreviousRecord(yearMonth);

        const totals = this.calcTotals(record);
        const prevTotals = prevRecord ? this.calcTotals(prevRecord) : null;

        this.renderSummaryCards(totals, prevTotals);
        this.renderPercentageBadges(totals, prevTotals);
        this.renderSparklines();
        this.renderHealthGauge(record, prevRecord, totals, prevTotals);
        this.renderLoanProgress(record, totals);
        this.renderLoanCountdown(record);
        this.renderTrafficLights(record, prevRecord, totals, prevTotals);
        this.renderBudgetProgress(record);
        this.renderGoalProgress();
        this.renderAssetBreakdown(record);
        this.renderExpenseBreakdown(record);
        this.renderCommentary(record, prevRecord, totals, prevTotals);
    }

    renderSummaryCards(totals, prevTotals) {
        // 純資産
        const nwEl = document.getElementById('card-net-worth');
        nwEl.textContent = this.formatCurrency(totals.netWorth);
        nwEl.className = 'card-amount ' + (totals.netWorth >= 0 ? 'text-positive' : 'text-negative');
        const nwCard = nwEl.closest('.summary-card');
        nwCard.className = 'summary-card ' + (totals.netWorth >= 0 ? 'positive' : 'negative');

        const nwDelta = document.getElementById('card-net-worth-delta');
        if (prevTotals) {
            const d = this.formatDelta(totals.netWorth, prevTotals.netWorth);
            nwDelta.textContent = d.text;
            nwDelta.className = 'card-delta ' + d.cls;
        } else { nwDelta.textContent = ''; }

        // 総資産
        document.getElementById('card-total-assets').textContent = this.formatCurrency(totals.totalAssets);
        const taDelta = document.getElementById('card-total-assets-delta');
        if (prevTotals) {
            const d = this.formatDelta(totals.totalAssets, prevTotals.totalAssets);
            taDelta.textContent = d.text; taDelta.className = 'card-delta ' + d.cls;
        } else { taDelta.textContent = ''; }

        // 総負債
        document.getElementById('card-total-liabilities').textContent = this.formatCurrency(totals.totalLiabilities);
        const tlDelta = document.getElementById('card-total-liabilities-delta');
        if (prevTotals) {
            const d = this.formatDelta(totals.totalLiabilities, prevTotals.totalLiabilities);
            tlDelta.textContent = d.text; tlDelta.className = 'card-delta ' + d.cls;
        } else { tlDelta.textContent = ''; }

        // 月利息情報
        const interestInfo = document.getElementById('card-interest-info');
        const loanAcc = this.accounts.find(a => a.id === 'smbc_loan');
        if (loanAcc) {
            const loanBal = totals.totalLiabilities;
            const monthlyInterest = Math.round(loanBal * (this.loanInterestRate / 100) / 12);
            interestInfo.textContent = `月利息 約¥${monthlyInterest.toLocaleString('ja-JP')}`;
        }

        // 月間収支
        const flowEl = document.getElementById('card-monthly-flow');
        flowEl.textContent = this.formatCurrency(totals.monthlyCashFlow);
        flowEl.className = 'card-amount ' + (totals.monthlyCashFlow >= 0 ? 'text-positive' : 'text-negative');
        const flowCard = flowEl.closest('.summary-card');
        flowCard.className = 'summary-card ' + (totals.monthlyCashFlow >= 0 ? 'positive' : 'negative');

        const flowDelta = document.getElementById('card-monthly-flow-delta');
        if (prevTotals) {
            const d = this.formatDelta(totals.monthlyCashFlow, prevTotals.monthlyCashFlow);
            flowDelta.textContent = d.text; flowDelta.className = 'card-delta ' + d.cls;
        } else { flowDelta.textContent = ''; }
    }

    // ======================================
    // 健康度ゲージ
    // ======================================
    calculateHealthScore(totals, prevTotals) {
        let score = 0;

        // 純資産トレンド (0-40点)
        if (prevTotals) {
            const change = totals.netWorth - prevTotals.netWorth;
            if (change > 100000) score += 40;
            else if (change > 50000) score += 35;
            else if (change > 0) score += 30;
            else if (change > -20000) score += 20;
            else if (change > -50000) score += 10;
        } else {
            score += 20; // 初月はニュートラル
        }

        // 負債比率 (0-30点)
        const ratio = totals.totalAssets > 0 ? totals.totalLiabilities / totals.totalAssets : 10;
        if (ratio < 0.5) score += 30;
        else if (ratio < 1.0) score += 20;
        else if (ratio < 2.0) score += 15;
        else if (ratio < 3.0) score += 10;
        else if (ratio < 5.0) score += 5;

        // 月次収支 (0-30点)
        if (totals.monthlyCashFlow > 100000) score += 30;
        else if (totals.monthlyCashFlow > 50000) score += 25;
        else if (totals.monthlyCashFlow > 0) score += 20;
        else if (totals.monthlyCashFlow > -50000) score += 10;
        else if (totals.monthlyCashFlow > -100000) score += 5;

        return Math.min(100, Math.max(0, score));
    }

    getGaugeColor(score) {
        if (score <= 30) return '#ef4444';
        if (score <= 50) return '#f59e0b';
        if (score <= 70) return '#eab308';
        return '#10b981';
    }

    getGaugeEmoji(score) {
        if (score <= 30) return '😰';
        if (score <= 50) return '😟';
        if (score <= 70) return '🙂';
        return '😊';
    }

    getGaugeLabel(score) {
        if (score <= 30) return '危険';
        if (score <= 50) return '注意';
        if (score <= 70) return '改善中';
        return '良好';
    }

    renderHealthGauge(record, prevRecord, totals, prevTotals) {
        const canvas = document.getElementById('health-gauge');
        const ctx = canvas.getContext('2d');

        if (this.charts.healthGauge) this.charts.healthGauge.destroy();

        if (!record) {
            document.getElementById('gauge-score').textContent = '--';
            document.getElementById('gauge-label').textContent = 'データなし';
            return;
        }

        const score = this.calculateHealthScore(totals, prevTotals);
        const color = this.getGaugeColor(score);

        this.charts.healthGauge = new Chart(ctx, {
            type: 'doughnut',
            data: {
                datasets: [{
                    data: [score, 100 - score],
                    backgroundColor: [color, '#e5e7eb'],
                    borderWidth: 0
                }]
            },
            options: {
                circumference: 270,
                rotation: 225,
                cutout: '78%',
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { display: false },
                    tooltip: { enabled: false }
                }
            }
        });

        document.getElementById('gauge-score').textContent = `${this.getGaugeEmoji(score)} ${score}`;
        document.getElementById('gauge-label').textContent = this.getGaugeLabel(score);
    }

    // ======================================
    // ローン返済プログレス
    // ======================================
    renderLoanProgress(record, totals) {
        const loanAcc = this.accounts.find(a => a.id === 'smbc_loan');
        if (!loanAcc || !record) {
            document.getElementById('loan-remaining').textContent = '--';
            document.getElementById('loan-estimate').textContent = '';
            document.getElementById('loan-progress-fill').style.width = '0%';
            document.getElementById('loan-progress-text').textContent = '0%';
            document.getElementById('loan-details').textContent = '';
            return;
        }

        const currentBalance = record.bs[loanAcc.id] || 0;
        const original = this.loanOriginalBalance || currentBalance;
        const paidOff = original - currentBalance;
        const percentage = original > 0 ? Math.max(0, Math.min(100, Math.round((paidOff / original) * 100))) : 0;

        document.getElementById('loan-remaining').textContent = `残高: ${this.formatCurrency(currentBalance)}`;

        // 完済予測（実績 → 設定値 の優先順）
        const monthlyInterest = Math.round(currentBalance * (this.loanInterestRate / 100) / 12);
        const sortedRecords = this.getSortedRecords();
        let monthlyRepayment = 0;
        if (sortedRecords.length >= 2) {
            const last = sortedRecords[sortedRecords.length - 1];
            const prev = sortedRecords[sortedRecords.length - 2];
            const lastBal = last.bs[loanAcc.id] || 0;
            const prevBal = prev.bs[loanAcc.id] || 0;
            if (prevBal > lastBal) monthlyRepayment = prevBal - lastBal;
        }
        if (monthlyRepayment === 0 && this.loanMonthlyRepayment && this.loanMonthlyRepayment > 0) {
            monthlyRepayment = this.loanMonthlyRepayment;
        }

        if (monthlyRepayment > monthlyInterest) {
            const principalPay = monthlyRepayment - monthlyInterest;
            const monthsLeft = Math.ceil(currentBalance / principalPay);
            document.getElementById('loan-estimate').textContent = `完済まで約${monthsLeft}ヶ月（${Math.ceil(monthsLeft / 12)}年）`;
        } else {
            document.getElementById('loan-estimate').textContent = monthlyRepayment === 0
                ? '⚙️ 設定タブで月々の返済額を入力してください'
                : '返済ペースが利息以下です';
        }

        const fillEl = document.getElementById('loan-progress-fill');
        fillEl.style.width = `${percentage}%`;
        document.getElementById('loan-progress-text').textContent = `${percentage}%`;

        document.getElementById('loan-details').textContent =
            `借入元本: ${this.formatCurrency(original)} / 返済済: ${this.formatCurrency(paidOff)} / 月利息: 約${this.formatCurrency(monthlyInterest)}`;
    }

    // ======================================
    // 信号機
    // ======================================
    renderTrafficLights(record, prevRecord, totals, prevTotals) {
        const setLight = (id, color) => {
            const el = document.getElementById(id);
            el.className = 'traffic-dot ' + color;
        };

        if (!record) {
            setLight('light-trend', '');
            setLight('light-ratio', '');
            setLight('light-flow', '');
            return;
        }

        // 純資産トレンド
        if (prevTotals) {
            const change = totals.netWorth - prevTotals.netWorth;
            setLight('light-trend', change > 0 ? 'green' : change === 0 ? 'yellow' : 'red');
        } else {
            setLight('light-trend', 'yellow');
        }

        // 負債比率
        const ratio = totals.totalAssets > 0 ? totals.totalLiabilities / totals.totalAssets : 10;
        setLight('light-ratio', ratio < 1.0 ? 'green' : ratio < 3.0 ? 'yellow' : 'red');

        // 月次収支
        setLight('light-flow', totals.monthlyCashFlow > 0 ? 'green' : totals.monthlyCashFlow === 0 ? 'yellow' : 'red');
    }

    // ======================================
    // 資産内訳ドーナツ
    // ======================================
    renderAssetBreakdown(record) {
        const canvas = document.getElementById('asset-breakdown-chart');
        const ctx = canvas.getContext('2d');
        if (this.charts.assetBreakdown) this.charts.assetBreakdown.destroy();

        if (!record) return;

        const assetAccounts = this.accounts.filter(a => a.type === 'asset');
        const data = assetAccounts.map(a => record.bs[a.id] || 0);
        const labels = assetAccounts.map(a => `${a.icon} ${a.name}`);
        const colors = ['#667eea', '#764ba2', '#10b981', '#f59e0b'];

        // 全部0の場合
        if (data.every(v => v === 0)) {
            this.charts.assetBreakdown = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: ['データなし'], datasets: [{ data: [1], backgroundColor: ['#e5e7eb'], borderWidth: 0 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
            return;
        }

        this.charts.assetBreakdown = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, data.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.parsed;
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                                return ` ¥${val.toLocaleString('ja-JP')} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // ======================================
    // 支出内訳ドーナツ
    // ======================================
    renderExpenseBreakdown(record) {
        const canvas = document.getElementById('expense-breakdown-chart');
        const ctx = canvas.getContext('2d');
        if (this.charts.expenseBreakdown) this.charts.expenseBreakdown.destroy();

        if (!record) return;

        const allExpenses = [...this.plCategories.expenses, ...this.plCategories.reference];
        const data = allExpenses.map(c => record.pl[c.id] || 0);
        const labels = allExpenses.map(c => `${c.icon} ${c.name}`);
        const colors = ['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4'];

        if (data.every(v => v === 0)) {
            this.charts.expenseBreakdown = new Chart(ctx, {
                type: 'doughnut',
                data: { labels: ['支出なし'], datasets: [{ data: [1], backgroundColor: ['#d1fae5'], borderWidth: 0 }] },
                options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } }
            });
            return;
        }

        this.charts.expenseBreakdown = new Chart(ctx, {
            type: 'doughnut',
            data: {
                labels: labels,
                datasets: [{
                    data: data,
                    backgroundColor: colors.slice(0, data.length),
                    borderWidth: 2,
                    borderColor: '#fff'
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: {
                    legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const val = ctx.parsed;
                                const total = ctx.dataset.data.reduce((a, b) => a + b, 0);
                                const pct = total > 0 ? Math.round((val / total) * 100) : 0;
                                return ` ¥${val.toLocaleString('ja-JP')} (${pct}%)`;
                            }
                        }
                    }
                }
            }
        });
    }

    // ======================================
    // 自動コメント
    // ======================================
    renderCommentary(record, prevRecord, totals, prevTotals) {
        const container = document.getElementById('commentary-content');
        if (!record) {
            container.innerHTML = '<p class="commentary-empty">データがありません</p>';
            return;
        }

        const comments = this.generateCommentary(record, prevRecord, totals, prevTotals);
        container.innerHTML = comments.map(c => `<div class="commentary-item">${c}</div>`).join('');
    }

    generateCommentary(record, prevRecord, totals, prevTotals) {
        const comments = [];

        // 純資産
        if (totals.netWorth < 0) {
            comments.push(`😰 純資産がマイナス（${this.formatCurrency(totals.netWorth)}）です。借金が貯金を上回っています。`);
        } else {
            comments.push(`💰 純資産は ${this.formatCurrency(totals.netWorth)} でプラスです！`);
        }

        // 前月比較
        if (prevTotals) {
            const nwChange = totals.netWorth - prevTotals.netWorth;
            if (nwChange > 0) {
                comments.push(`📈 先月より純資産が ¥${nwChange.toLocaleString('ja-JP')} 改善しています！この調子！`);
            } else if (nwChange < 0) {
                comments.push(`📉 先月より純資産が ¥${Math.abs(nwChange).toLocaleString('ja-JP')} 減少しています。支出を見直しましょう。`);
            } else {
                comments.push(`➡️ 純資産は先月と変わりません。`);
            }
        }

        // 月次収支
        if (totals.monthlyCashFlow < 0) {
            comments.push(`💸 今月は ¥${Math.abs(totals.monthlyCashFlow).toLocaleString('ja-JP')} の赤字です。収入を増やすか支出を減らしましょう。`);
        } else if (totals.monthlyCashFlow > 0) {
            comments.push(`✨ 今月は ¥${totals.monthlyCashFlow.toLocaleString('ja-JP')} の黒字です！素晴らしい！`);
        }

        // ローン
        const loanAcc = this.accounts.find(a => a.id === 'smbc_loan');
        if (loanAcc && record.bs[loanAcc.id] > 0) {
            const balance = record.bs[loanAcc.id];
            const monthlyInterest = Math.round(balance * (this.loanInterestRate / 100) / 12);
            comments.push(`🏦 ローン残高 ${this.formatCurrency(balance)}（毎月 約¥${monthlyInterest.toLocaleString('ja-JP')} の利息が発生）`);

            if (balance > totals.totalAssets * 3) {
                comments.push(`⚠️ ローンが資産の3倍以上あります。返済計画を見直しましょう。`);
            }
        }

        // 法人支出（CCAGI）
        const ccagiVal = record.pl['ccagi'] || 0;
        if (ccagiVal > 0) {
            comments.push(`🏢 法人経費（CCAGI）: ¥${ccagiVal.toLocaleString('ja-JP')} が支出に含まれています。`);
        }

        // 貯金が少ない警告
        if (totals.totalAssets < 500000) {
            comments.push(`💡 総資産が50万円を下回っています。緊急時の備えとして最低でも生活費3ヶ月分は確保しましょう。`);
        }

        return comments;
    }

    // ======================================
    // BS詳細タブ
    // ======================================
    getSelectedBSDetailYearMonth() {
        const y = document.getElementById('bs-detail-year').value;
        const m = String(document.getElementById('bs-detail-month').value).padStart(2, '0');
        return `${y}-${m}`;
    }

    renderBSDetail() {
        const yearMonth = this.getSelectedBSDetailYearMonth();
        const record = this.getRecord(yearMonth);
        const prevRecord = this.getPreviousRecord(yearMonth);
        const totals = this.calcTotals(record);
        const prevTotals = prevRecord ? this.calcTotals(prevRecord) : null;

        // サマリーカード
        const taEl = document.getElementById('bs-total-assets');
        taEl.textContent = record ? this.formatCurrency(totals.totalAssets) : '--';
        taEl.className = 'detail-summary-value text-positive';

        const tlEl = document.getElementById('bs-total-liabilities');
        tlEl.textContent = record ? this.formatCurrency(totals.totalLiabilities) : '--';
        tlEl.className = 'detail-summary-value text-negative';

        const nwEl = document.getElementById('bs-net-worth');
        nwEl.textContent = record ? this.formatCurrency(totals.netWorth) : '--';
        nwEl.className = 'detail-summary-value ' + (totals.netWorth >= 0 ? 'text-positive' : 'text-negative');
        const nwCard = document.getElementById('bs-net-worth-card');
        nwCard.className = 'detail-summary-item ' + (totals.netWorth >= 0 ? 'net-positive' : 'net-negative');

        // 資産テーブル
        const assetTbody = document.getElementById('bs-asset-tbody');
        assetTbody.innerHTML = '';
        const assetAccounts = this.accounts.filter(a => a.type === 'asset');
        assetAccounts.forEach(acc => {
            const val = record ? (record.bs[acc.id] || 0) : 0;
            const prevVal = prevRecord ? (prevRecord.bs[acc.id] || 0) : null;
            const ratio = totals.totalAssets > 0 ? Math.round((val / totals.totalAssets) * 100) : 0;
            const delta = this.formatDelta(val, prevVal);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="item-icon">${acc.icon}</span> ${acc.name}</td>
                <td class="col-amount">${this.formatCurrency(val)}</td>
                <td class="col-ratio"><div class="ratio-bar-wrapper"><div class="ratio-bar"><div class="ratio-bar-fill" style="width:${ratio}%"></div></div><span>${ratio}%</span></div></td>
                <td class="col-delta ${delta.cls}">${delta.text}</td>
            `;
            assetTbody.appendChild(tr);
        });

        document.getElementById('bs-asset-total-cell').textContent = record ? this.formatCurrency(totals.totalAssets) : '--';
        const assetDeltaCell = document.getElementById('bs-asset-delta-cell');
        if (prevTotals) {
            const d = this.formatDelta(totals.totalAssets, prevTotals.totalAssets);
            assetDeltaCell.textContent = d.text; assetDeltaCell.className = 'col-delta ' + d.cls;
        } else { assetDeltaCell.textContent = '--'; assetDeltaCell.className = 'col-delta'; }

        // 負債テーブル
        const liabTbody = document.getElementById('bs-liability-tbody');
        liabTbody.innerHTML = '';
        const liabAccounts = this.accounts.filter(a => a.type === 'liability');
        liabAccounts.forEach(acc => {
            const val = record ? (record.bs[acc.id] || 0) : 0;
            const prevVal = prevRecord ? (prevRecord.bs[acc.id] || 0) : null;
            const ratio = totals.totalLiabilities > 0 ? Math.round((val / totals.totalLiabilities) * 100) : 0;
            const delta = this.formatDelta(val, prevVal);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="item-icon">${acc.icon}</span> ${acc.name}</td>
                <td class="col-amount">${this.formatCurrency(val)}</td>
                <td class="col-ratio"><div class="ratio-bar-wrapper"><div class="ratio-bar"><div class="ratio-bar-fill" style="width:${ratio}%; background:#ef4444;"></div></div><span>${ratio}%</span></div></td>
                <td class="col-delta ${delta.cls}">${delta.text}</td>
            `;
            liabTbody.appendChild(tr);
        });

        document.getElementById('bs-liability-total-cell').textContent = record ? this.formatCurrency(totals.totalLiabilities) : '--';
        const liabDeltaCell = document.getElementById('bs-liability-delta-cell');
        if (prevTotals) {
            const d = this.formatDelta(totals.totalLiabilities, prevTotals.totalLiabilities);
            liabDeltaCell.textContent = d.text; liabDeltaCell.className = 'col-delta ' + d.cls;
        } else { liabDeltaCell.textContent = '--'; liabDeltaCell.className = 'col-delta'; }

        // チャート
        this.renderBSAssetPie(record);
        this.renderBSBarChart(record, totals);
        this.renderBSCommentary(record, prevRecord, totals, prevTotals);
    }

    renderBSAssetPie(record) {
        const canvas = document.getElementById('bs-asset-pie');
        const ctx = canvas.getContext('2d');
        if (this.charts.bsAssetPie) this.charts.bsAssetPie.destroy();
        if (!record) return;

        const assetAccounts = this.accounts.filter(a => a.type === 'asset');
        const data = assetAccounts.map(a => record.bs[a.id] || 0);
        const labels = assetAccounts.map(a => `${a.icon} ${a.name}`);
        const colors = ['#667eea', '#764ba2', '#10b981', '#f59e0b', '#06b6d4', '#8b5cf6'];

        if (data.every(v => v === 0)) {
            this.charts.bsAssetPie = new Chart(ctx, { type: 'doughnut', data: { labels: ['データなし'], datasets: [{ data: [1], backgroundColor: ['#e5e7eb'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
            return;
        }

        this.charts.bsAssetPie = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, data.length), borderWidth: 2, borderColor: '#fff' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } }, tooltip: { callbacks: { label: (c) => { const v = c.parsed; const t = c.dataset.data.reduce((a, b) => a + b, 0); return ` ¥${v.toLocaleString('ja-JP')} (${t > 0 ? Math.round((v/t)*100) : 0}%)`; } } } } }
        });
    }

    renderBSBarChart(record, totals) {
        const canvas = document.getElementById('bs-bar-chart');
        const ctx = canvas.getContext('2d');
        if (this.charts.bsBar) this.charts.bsBar.destroy();
        if (!record) return;

        this.charts.bsBar = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['資産', '負債', '純資産'],
                datasets: [{
                    data: [totals.totalAssets, totals.totalLiabilities, totals.netWorth],
                    backgroundColor: ['rgba(16, 185, 129, 0.7)', 'rgba(239, 68, 68, 0.7)', totals.netWorth >= 0 ? 'rgba(102, 126, 234, 0.7)' : 'rgba(239, 68, 68, 0.4)'],
                    borderColor: ['#10b981', '#ef4444', totals.netWorth >= 0 ? '#667eea' : '#ef4444'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => `${this.formatCurrency(c.parsed.y)}` } } },
                scales: { y: { ticks: { callback: (v) => `¥${(Math.abs(v) / 10000).toFixed(0)}万` } } }
            }
        });
    }

    renderBSCommentary(record, prevRecord, totals, prevTotals) {
        const container = document.getElementById('bs-commentary-content');
        if (!record) { container.innerHTML = '<p class="commentary-empty">データがありません</p>'; return; }

        const comments = [];

        // 純資産
        if (totals.netWorth < 0) {
            comments.push(`😰 純資産は ${this.formatCurrency(totals.netWorth)} です。負債が資産を上回っています。`);
        } else {
            comments.push(`✨ 純資産は ${this.formatCurrency(totals.netWorth)} でプラス！健全な状態です。`);
        }

        // 負債比率
        const ratio = totals.totalAssets > 0 ? (totals.totalLiabilities / totals.totalAssets) : 0;
        if (ratio > 3) comments.push(`🔴 負債が資産の${ratio.toFixed(1)}倍あります。返済を最優先にしましょう。`);
        else if (ratio > 1) comments.push(`🟡 負債が資産より多いですが、改善の余地があります。`);
        else if (ratio > 0) comments.push(`🟢 資産が負債を上回っています。良い状態です！`);

        // 前月比
        if (prevTotals) {
            const assetChange = totals.totalAssets - prevTotals.totalAssets;
            const liabChange = totals.totalLiabilities - prevTotals.totalLiabilities;
            if (assetChange > 0) comments.push(`📈 資産が前月より ¥${assetChange.toLocaleString('ja-JP')} 増えました。`);
            if (assetChange < 0) comments.push(`📉 資産が前月より ¥${Math.abs(assetChange).toLocaleString('ja-JP')} 減りました。`);
            if (liabChange < 0) comments.push(`🎉 負債が前月より ¥${Math.abs(liabChange).toLocaleString('ja-JP')} 減少！順調に返済が進んでいます。`);
            if (liabChange > 0) comments.push(`⚠️ 負債が前月より ¥${liabChange.toLocaleString('ja-JP')} 増えました。注意が必要です。`);
        }

        // 口座ごと
        const assetAccounts = this.accounts.filter(a => a.type === 'asset');
        const maxAcc = assetAccounts.reduce((max, a) => (record.bs[a.id] || 0) > (record.bs[max.id] || 0) ? a : max, assetAccounts[0]);
        if (maxAcc) {
            comments.push(`🏦 最も残高が多い口座: ${maxAcc.icon} ${maxAcc.name}（${this.formatCurrency(record.bs[maxAcc.id] || 0)}）`);
        }

        // ローン利息
        const loanAcc = this.accounts.find(a => a.id === 'smbc_loan');
        if (loanAcc && record.bs[loanAcc.id] > 0) {
            const monthlyInterest = Math.round(record.bs[loanAcc.id] * (this.loanInterestRate / 100) / 12);
            comments.push(`💸 ローン利息: 毎月 約¥${monthlyInterest.toLocaleString('ja-JP')} が発生しています。`);
        }

        container.innerHTML = comments.map(c => `<div class="commentary-item">${c}</div>`).join('');
    }

    // ======================================
    // PL詳細タブ
    // ======================================
    getSelectedPLDetailYearMonth() {
        const y = document.getElementById('pl-detail-year').value;
        const m = String(document.getElementById('pl-detail-month').value).padStart(2, '0');
        return `${y}-${m}`;
    }

    renderPLDetail() {
        const yearMonth = this.getSelectedPLDetailYearMonth();
        const record = this.getRecord(yearMonth);
        const prevRecord = this.getPreviousRecord(yearMonth);
        const totals = this.calcTotals(record);
        const prevTotals = prevRecord ? this.calcTotals(prevRecord) : null;

        // サマリーカード
        const incEl = document.getElementById('pl-total-income');
        incEl.textContent = record ? this.formatCurrency(totals.totalIncome) : '--';

        const expEl = document.getElementById('pl-total-expenses');
        expEl.textContent = record ? this.formatCurrency(totals.totalExpenses) : '--';

        const flowEl = document.getElementById('pl-monthly-flow');
        flowEl.textContent = record ? this.formatCurrency(totals.monthlyCashFlow) : '--';
        flowEl.className = 'detail-summary-value ' + (totals.monthlyCashFlow >= 0 ? 'text-positive' : 'text-negative');
        const flowCard = document.getElementById('pl-flow-card');
        flowCard.className = 'detail-summary-item ' + (totals.monthlyCashFlow >= 0 ? 'net-positive' : 'net-negative');

        // 収入テーブル
        const incomeTbody = document.getElementById('pl-income-tbody');
        incomeTbody.innerHTML = '';
        this.plCategories.income.forEach(cat => {
            const val = record ? (record.pl[cat.id] || 0) : 0;
            const prevVal = prevRecord ? (prevRecord.pl[cat.id] || 0) : null;
            const delta = this.formatDelta(val, prevVal);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="item-icon">${cat.icon}</span> ${cat.name}</td>
                <td class="col-amount">${this.formatCurrency(val)}</td>
                <td class="col-delta ${delta.cls}">${delta.text}</td>
            `;
            incomeTbody.appendChild(tr);
        });

        document.getElementById('pl-income-total-cell').textContent = record ? this.formatCurrency(totals.totalIncome) : '--';
        const incDeltaCell = document.getElementById('pl-income-delta-cell');
        if (prevTotals) {
            const d = this.formatDelta(totals.totalIncome, prevTotals.totalIncome);
            incDeltaCell.textContent = d.text; incDeltaCell.className = 'col-delta ' + d.cls;
        } else { incDeltaCell.textContent = '--'; incDeltaCell.className = 'col-delta'; }

        // 支出テーブル
        const expTbody = document.getElementById('pl-expense-tbody');
        expTbody.innerHTML = '';
        this.plCategories.expenses.forEach(cat => {
            const val = record ? (record.pl[cat.id] || 0) : 0;
            const prevVal = prevRecord ? (prevRecord.pl[cat.id] || 0) : null;
            const ratio = totals.totalExpenses > 0 ? Math.round((val / totals.totalExpenses) * 100) : 0;
            const delta = this.formatDelta(val, prevVal);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="item-icon">${cat.icon}</span> ${cat.name}${cat.desc ? ` <small style="color:#aaa">(${cat.desc})</small>` : ''}</td>
                <td class="col-amount">${this.formatCurrency(val)}</td>
                <td class="col-ratio"><div class="ratio-bar-wrapper"><div class="ratio-bar"><div class="ratio-bar-fill" style="width:${ratio}%; background:#ef4444;"></div></div><span>${ratio}%</span></div></td>
                <td class="col-delta ${delta.cls}">${delta.text}</td>
            `;
            expTbody.appendChild(tr);
        });

        document.getElementById('pl-expense-total-cell').textContent = record ? this.formatCurrency(totals.totalExpenses) : '--';
        const expDeltaCell = document.getElementById('pl-expense-delta-cell');
        if (prevTotals) {
            const d = this.formatDelta(totals.totalExpenses, prevTotals.totalExpenses);
            expDeltaCell.textContent = d.text; expDeltaCell.className = 'col-delta ' + d.cls;
        } else { expDeltaCell.textContent = '--'; expDeltaCell.className = 'col-delta'; }

        // 参考テーブル（参考カテゴリがある場合のみ表示）
        const refSection = document.getElementById('pl-reference-section');
        if (refSection) refSection.style.display = this.plCategories.reference.length > 0 ? '' : 'none';
        const refTbody = document.getElementById('pl-reference-tbody');
        refTbody.innerHTML = '';
        this.plCategories.reference.forEach(cat => {
            const val = record ? (record.pl[cat.id] || 0) : 0;
            const prevVal = prevRecord ? (prevRecord.pl[cat.id] || 0) : null;
            const delta = this.formatDelta(val, prevVal);

            const tr = document.createElement('tr');
            tr.innerHTML = `
                <td><span class="item-icon">${cat.icon}</span> ${cat.name}${cat.desc ? ` <small style="color:#aaa">(${cat.desc})</small>` : ''}</td>
                <td class="col-amount">${this.formatCurrency(val)}</td>
                <td class="col-delta ${delta.cls}">${delta.text}</td>
            `;
            refTbody.appendChild(tr);
        });

        // チャート
        this.renderPLWaterfallChart(record, totals);
        this.renderPLExpensePie(record);
        this.renderPLIncomeExpenseBar(record, totals);
        this.renderPLCommentary(record, prevRecord, totals, prevTotals);
    }

    renderPLWaterfallChart(record, totals) {
        const canvas = document.getElementById('pl-waterfall-chart');
        const ctx = canvas.getContext('2d');
        if (this.charts.plWaterfall) this.charts.plWaterfall.destroy();
        if (!record) return;

        const incomeItems = this.plCategories.income.map(c => ({ name: c.icon + ' ' + c.name, val: record.pl[c.id] || 0 }));
        const expenseItems = this.plCategories.expenses.map(c => ({ name: c.icon + ' ' + c.name, val: -(record.pl[c.id] || 0) }));

        const labels = [...incomeItems.map(i => i.name), ...expenseItems.map(i => i.name), '📊 損益'];
        const data = [...incomeItems.map(i => i.val), ...expenseItems.map(i => i.val), totals.monthlyCashFlow];
        const colors = data.map((v, i) => i === data.length - 1 ? (v >= 0 ? 'rgba(102, 126, 234, 0.8)' : 'rgba(239, 68, 68, 0.8)') : v >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)');

        this.charts.plWaterfall = new Chart(ctx, {
            type: 'bar',
            data: { labels, datasets: [{ data, backgroundColor: colors, borderWidth: 0 }] },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => this.formatCurrency(c.parsed.y) } } },
                scales: {
                    y: { ticks: { callback: (v) => `¥${(Math.abs(v) / 10000).toFixed(1)}万` }, grid: { color: (c) => c.tick.value === 0 ? '#333' : '#f0f0f0' } }
                }
            }
        });
    }

    renderPLExpensePie(record) {
        const canvas = document.getElementById('pl-expense-pie');
        const ctx = canvas.getContext('2d');
        if (this.charts.plExpensePie) this.charts.plExpensePie.destroy();
        if (!record) return;

        const data = this.plCategories.expenses.map(c => record.pl[c.id] || 0);
        const labels = this.plCategories.expenses.map(c => `${c.icon} ${c.name}`);
        const colors = ['#ef4444', '#f59e0b', '#8b5cf6', '#06b6d4'];

        if (data.every(v => v === 0)) {
            this.charts.plExpensePie = new Chart(ctx, { type: 'doughnut', data: { labels: ['支出なし'], datasets: [{ data: [1], backgroundColor: ['#d1fae5'], borderWidth: 0 }] }, options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { display: false } } } });
            return;
        }

        this.charts.plExpensePie = new Chart(ctx, {
            type: 'doughnut',
            data: { labels, datasets: [{ data, backgroundColor: colors.slice(0, data.length), borderWidth: 2, borderColor: '#fff' }] },
            options: { responsive: true, maintainAspectRatio: false, plugins: { legend: { position: 'bottom', labels: { font: { size: 11 }, padding: 12 } }, tooltip: { callbacks: { label: (c) => { const v = c.parsed; const t = c.dataset.data.reduce((a, b) => a + b, 0); return ` ¥${v.toLocaleString('ja-JP')} (${t > 0 ? Math.round((v/t)*100) : 0}%)`; } } } } }
        });
    }

    renderPLIncomeExpenseBar(record, totals) {
        const canvas = document.getElementById('pl-income-expense-bar');
        const ctx = canvas.getContext('2d');
        if (this.charts.plIncomeExpense) this.charts.plIncomeExpense.destroy();
        if (!record) return;

        this.charts.plIncomeExpense = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: ['収入', '支出'],
                datasets: [{
                    data: [totals.totalIncome, totals.totalExpenses],
                    backgroundColor: ['rgba(16, 185, 129, 0.7)', 'rgba(239, 68, 68, 0.7)'],
                    borderColor: ['#10b981', '#ef4444'],
                    borderWidth: 2
                }]
            },
            options: {
                responsive: true, maintainAspectRatio: false,
                plugins: { legend: { display: false }, tooltip: { callbacks: { label: (c) => this.formatCurrency(c.parsed.y) } } },
                scales: { y: { beginAtZero: true, ticks: { callback: (v) => `¥${(v / 10000).toFixed(0)}万` } } }
            }
        });
    }

    renderPLCommentary(record, prevRecord, totals, prevTotals) {
        const container = document.getElementById('pl-commentary-content');
        if (!record) { container.innerHTML = '<p class="commentary-empty">データがありません</p>'; return; }

        const comments = [];

        // 月次損益
        if (totals.monthlyCashFlow > 0) {
            comments.push(`✨ 今月は ¥${totals.monthlyCashFlow.toLocaleString('ja-JP')} の黒字です！素晴らしい！`);
        } else if (totals.monthlyCashFlow === 0) {
            comments.push(`➡️ 収支トントンです。支出を抑えて黒字を目指しましょう。`);
        } else {
            comments.push(`💸 今月は ¥${Math.abs(totals.monthlyCashFlow).toLocaleString('ja-JP')} の赤字です。`);
        }

        // 収入
        if (totals.totalIncome === 0) {
            comments.push(`💼 役員報酬は0円です。収入源の確保が課題です。`);
        }

        // 支出内訳
        this.plCategories.expenses.forEach(cat => {
            const val = record.pl[cat.id] || 0;
            if (val > 0) {
                const ratio = totals.totalExpenses > 0 ? Math.round((val / totals.totalExpenses) * 100) : 0;
                comments.push(`${cat.icon} ${cat.name}: ¥${val.toLocaleString('ja-JP')}（支出の${ratio}%）`);
            }
        });

        // 前月比
        if (prevTotals) {
            const expChange = totals.totalExpenses - prevTotals.totalExpenses;
            if (expChange > 0) comments.push(`📈 支出が前月より ¥${expChange.toLocaleString('ja-JP')} 増えています。`);
            if (expChange < 0) comments.push(`📉 支出が前月より ¥${Math.abs(expChange).toLocaleString('ja-JP')} 減りました！節約できています。`);
        }

        // 法人支出（CCAGI）
        const ccagiVal = record.pl['ccagi'] || 0;
        if (ccagiVal > 0) {
            comments.push(`🏢 法人経費（CCAGI）: ¥${ccagiVal.toLocaleString('ja-JP')} が支出に含まれています。`);
        }

        container.innerHTML = comments.map(c => `<div class="commentary-item">${c}</div>`).join('');
    }

    // ======================================
    // 月次入力
    // ======================================
    onInputDateChange() {
        this.renderInputForm();
    }

    renderInputForm() {
        const yearMonth = this.getSelectedInputYearMonth();
        const record = this.getRecord(yearMonth);
        const prevRecord = this.getPreviousRecord(yearMonth);

        // 既存データ通知
        const existingNotice = document.getElementById('input-existing-data');
        existingNotice.style.display = record ? 'block' : 'none';

        // BS: 資産
        const assetContainer = document.getElementById('asset-inputs');
        assetContainer.innerHTML = '';
        this.accounts.filter(a => a.type === 'asset').forEach(acc => {
            assetContainer.appendChild(this.createInputRow(acc, 'bs', record, prevRecord));
        });

        // BS: 負債
        const liabContainer = document.getElementById('liability-inputs');
        liabContainer.innerHTML = '';
        this.accounts.filter(a => a.type === 'liability').forEach(acc => {
            liabContainer.appendChild(this.createInputRow(acc, 'bs', record, prevRecord));
        });

        // PL: 収入
        const incomeContainer = document.getElementById('income-inputs');
        incomeContainer.innerHTML = '';
        this.plCategories.income.forEach(cat => {
            incomeContainer.appendChild(this.createInputRow(cat, 'pl', record, prevRecord));
        });

        // PL: 支出
        const expenseContainer = document.getElementById('expense-inputs');
        expenseContainer.innerHTML = '';
        this.plCategories.expenses.forEach(cat => {
            expenseContainer.appendChild(this.createInputRow(cat, 'pl', record, prevRecord));
        });

        // 参考（参考カテゴリがある場合のみ表示）
        const inputRefSection = document.getElementById('input-reference-section');
        if (inputRefSection) inputRefSection.style.display = this.plCategories.reference.length > 0 ? '' : 'none';
        const refContainer = document.getElementById('reference-inputs');
        refContainer.innerHTML = '';
        this.plCategories.reference.forEach(cat => {
            refContainer.appendChild(this.createInputRow(cat, 'pl', record, prevRecord));
        });

        // メモ
        document.getElementById('input-memo').value = record ? (record.memo || '') : '';

        this.updateInputTotals();
    }

    createInputRow(item, dataType, record, prevRecord) {
        const row = document.createElement('div');
        row.className = 'account-input-row';

        const currentVal = record ? (dataType === 'bs' ? (record.bs[item.id] || 0) : (record.pl[item.id] || 0)) : '';
        const prevVal = prevRecord ? (dataType === 'bs' ? (prevRecord.bs[item.id] || 0) : (prevRecord.pl[item.id] || 0)) : null;

        let prevHtml = '';
        if (prevVal !== null) {
            const inputVal = currentVal !== '' ? currentVal : 0;
            const diff = inputVal - prevVal;
            let deltaCls = 'flat';
            let deltaText = '±0';
            if (diff > 0) { deltaCls = 'up'; deltaText = `+¥${diff.toLocaleString('ja-JP')}`; }
            if (diff < 0) { deltaCls = 'down'; deltaText = `▲¥${Math.abs(diff).toLocaleString('ja-JP')}`; }
            prevHtml = `<div class="row-prev">前月: ¥${prevVal.toLocaleString('ja-JP')} <span class="prev-delta ${deltaCls}">(${deltaText})</span></div>`;
        }

        const descHtml = item.desc ? `<span class="row-desc">(${item.desc})</span>` : '';

        row.innerHTML = `
            <span class="row-icon">${item.icon}</span>
            <span class="row-name">${item.name}</span>
            ${descHtml}
            <input type="number" id="input-${item.id}" value="${currentVal}" min="0" data-id="${item.id}" data-type="${dataType}" placeholder="0">
            <span class="row-unit">円</span>
            ${prevHtml}
        `;

        const input = row.querySelector('input');
        input.addEventListener('input', () => {
            this.validateInput(input);
            this.updateInputTotals();
        });

        return row;
    }

    updateInputTotals() {
        const getVal = (id) => parseInt(document.getElementById(`input-${id}`)?.value) || 0;

        const totalAssets = this.accounts.filter(a => a.type === 'asset').reduce((s, a) => s + getVal(a.id), 0);
        const totalLiab = this.accounts.filter(a => a.type === 'liability').reduce((s, a) => s + getVal(a.id), 0);
        const netWorth = totalAssets - totalLiab;
        const totalIncome = this.plCategories.income.reduce((s, c) => s + getVal(c.id), 0);
        const totalExpenses = this.plCategories.expenses.reduce((s, c) => s + getVal(c.id), 0);
        const monthlyFlow = totalIncome - totalExpenses;

        document.getElementById('input-total-assets').textContent = this.formatCurrency(totalAssets);
        document.getElementById('input-total-liabilities').textContent = this.formatCurrency(totalLiab);

        const nwEl = document.getElementById('input-net-worth');
        nwEl.textContent = this.formatCurrency(netWorth);

        document.getElementById('input-total-income').textContent = this.formatCurrency(totalIncome);
        document.getElementById('input-total-expenses').textContent = this.formatCurrency(totalExpenses);

        const flowEl = document.getElementById('input-monthly-flow');
        flowEl.textContent = this.formatCurrency(monthlyFlow);

        // 前月比の差分をリアルタイム更新
        const yearMonth = this.getSelectedInputYearMonth();
        const prevRecord = this.getPreviousRecord(yearMonth);
        if (prevRecord) {
            document.querySelectorAll('.account-input-row').forEach(row => {
                const input = row.querySelector('input');
                if (!input) return;
                const id = input.dataset.id;
                const type = input.dataset.type;
                const prevVal = type === 'bs' ? (prevRecord.bs[id] || 0) : (prevRecord.pl[id] || 0);
                const curVal = parseInt(input.value) || 0;
                const diff = curVal - prevVal;
                const deltaEl = row.querySelector('.prev-delta');
                if (deltaEl) {
                    if (diff > 0) {
                        deltaEl.textContent = `(+¥${diff.toLocaleString('ja-JP')})`;
                        deltaEl.className = 'prev-delta up';
                    } else if (diff < 0) {
                        deltaEl.textContent = `(▲¥${Math.abs(diff).toLocaleString('ja-JP')})`;
                        deltaEl.className = 'prev-delta down';
                    } else {
                        deltaEl.textContent = '(±0)';
                        deltaEl.className = 'prev-delta flat';
                    }
                }
            });
        }
    }

    copyFromPreviousMonth() {
        const yearMonth = this.getSelectedInputYearMonth();
        const prevRecord = this.getPreviousRecord(yearMonth);
        if (!prevRecord) {
            alert('前月のデータがありません。');
            return;
        }

        // BS
        this.accounts.forEach(acc => {
            const input = document.getElementById(`input-${acc.id}`);
            if (input) input.value = prevRecord.bs[acc.id] || 0;
        });

        // PL
        [...this.plCategories.income, ...this.plCategories.expenses, ...this.plCategories.reference].forEach(cat => {
            const input = document.getElementById(`input-${cat.id}`);
            if (input) input.value = prevRecord.pl[cat.id] || 0;
        });

        document.getElementById('input-memo').value = '';
        this.updateInputTotals();
        this.showStatus('info', '📋', '前月のデータをコピーしました。必要に応じて修正してください。');
    }

    saveMonthlyData() {
        const yearMonth = this.getSelectedInputYearMonth();
        const getVal = (id) => parseInt(document.getElementById(`input-${id}`)?.value) || 0;

        const bs = {};
        this.accounts.forEach(acc => { bs[acc.id] = getVal(acc.id); });

        const pl = {};
        [...this.plCategories.income, ...this.plCategories.expenses, ...this.plCategories.reference].forEach(cat => {
            pl[cat.id] = getVal(cat.id);
        });

        const newRecord = {
            yearMonth: yearMonth,
            recordedAt: new Date().toISOString(),
            bs: bs,
            pl: pl,
            memo: document.getElementById('input-memo').value.trim()
        };

        // 既存レコードを更新または追加
        const idx = this.monthlyRecords.findIndex(r => r.yearMonth === yearMonth);
        if (idx >= 0) {
            this.monthlyRecords[idx] = newRecord;
        } else {
            this.monthlyRecords.push(newRecord);
        }

        // ソート
        this.monthlyRecords.sort((a, b) => a.yearMonth.localeCompare(b.yearMonth));

        this.isDirty = true;
        this.updateSaveStatus();
        this.showStatus('success', '✅', `${yearMonth} のデータを保存しました！（ファイルに保存するには「💾 データを保存」を押してください）`);
        this.renderInputForm();
    }

    // ======================================
    // 推移グラフ
    // ======================================
    renderCharts() {
        const range = parseInt(document.getElementById('chart-range').value);
        let records = this.getSortedRecords();

        if (range > 0 && records.length > range) {
            records = records.slice(-range);
        }

        if (records.length === 0) return;

        this.renderNetWorthChart(records);
        this.renderAssetsLiabilitiesChart(records);
        this.renderCashFlowChart(records);
        this.renderLoanTrendChart(records);
    }

    renderNetWorthChart(records) {
        const canvas = document.getElementById('net-worth-chart');
        const ctx = canvas.getContext('2d');
        if (this.charts.netWorth) this.charts.netWorth.destroy();

        const labels = records.map(r => r.yearMonth);
        const data = records.map(r => this.calcTotals(r).netWorth);

        this.charts.netWorth = new Chart(ctx, {
            type: 'line',
            data: {
                labels: labels,
                datasets: [{
                    label: '純資産',
                    data: data,
                    borderColor: '#667eea',
                    backgroundColor: (context) => {
                        const chart = context.chart;
                        const { ctx: c, chartArea } = chart;
                        if (!chartArea) return 'rgba(102, 126, 234, 0.1)';
                        const gradient = c.createLinearGradient(0, chartArea.top, 0, chartArea.bottom);
                        gradient.addColorStop(0, 'rgba(16, 185, 129, 0.3)');
                        gradient.addColorStop(0.5, 'rgba(102, 126, 234, 0.05)');
                        gradient.addColorStop(1, 'rgba(239, 68, 68, 0.3)');
                        return gradient;
                    },
                    fill: true,
                    tension: 0.3,
                    borderWidth: 3,
                    pointRadius: 5,
                    pointBackgroundColor: data.map(v => v >= 0 ? '#10b981' : '#ef4444'),
                    pointBorderColor: '#fff',
                    pointBorderWidth: 2
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        ticks: {
                            callback: (val) => val >= 0 ? `¥${(val / 10000).toFixed(0)}万` : `▲¥${(Math.abs(val) / 10000).toFixed(0)}万`
                        },
                        grid: { color: (ctx) => ctx.tick.value === 0 ? '#333' : '#f0f0f0' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `純資産: ${this.formatCurrency(ctx.parsed.y)}`
                        }
                    }
                }
            }
        });
    }

    renderAssetsLiabilitiesChart(records) {
        const canvas = document.getElementById('assets-liabilities-chart');
        const ctx = canvas.getContext('2d');
        if (this.charts.assetsLiabilities) this.charts.assetsLiabilities.destroy();

        const labels = records.map(r => r.yearMonth);

        this.charts.assetsLiabilities = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [
                    {
                        label: '総資産',
                        data: records.map(r => this.calcTotals(r).totalAssets),
                        backgroundColor: 'rgba(16, 185, 129, 0.7)',
                        borderColor: '#10b981',
                        borderWidth: 1
                    },
                    {
                        label: '総負債',
                        data: records.map(r => -this.calcTotals(r).totalLiabilities),
                        backgroundColor: 'rgba(239, 68, 68, 0.7)',
                        borderColor: '#ef4444',
                        borderWidth: 1
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    x: { stacked: false },
                    y: {
                        ticks: {
                            callback: (val) => {
                                const abs = Math.abs(val);
                                return (val < 0 ? '▲' : '') + `¥${(abs / 10000).toFixed(0)}万`;
                            }
                        },
                        grid: { color: (ctx) => ctx.tick.value === 0 ? '#333' : '#f0f0f0' }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => {
                                const val = Math.abs(ctx.parsed.y);
                                return `${ctx.dataset.label}: ¥${val.toLocaleString('ja-JP')}`;
                            }
                        }
                    }
                }
            }
        });
    }

    renderCashFlowChart(records) {
        const canvas = document.getElementById('cash-flow-chart');
        const ctx = canvas.getContext('2d');
        if (this.charts.cashFlow) this.charts.cashFlow.destroy();

        const labels = records.map(r => r.yearMonth);
        const data = records.map(r => this.calcTotals(r).monthlyCashFlow);

        this.charts.cashFlow = new Chart(ctx, {
            type: 'bar',
            data: {
                labels: labels,
                datasets: [{
                    label: '月次収支',
                    data: data,
                    backgroundColor: data.map(v => v >= 0 ? 'rgba(16, 185, 129, 0.7)' : 'rgba(239, 68, 68, 0.7)'),
                    borderColor: data.map(v => v >= 0 ? '#10b981' : '#ef4444'),
                    borderWidth: 1
                }]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        ticks: {
                            callback: (val) => {
                                const abs = Math.abs(val);
                                return (val < 0 ? '▲' : '') + `¥${(abs / 10000).toFixed(0)}万`;
                            }
                        },
                        grid: { color: (ctx) => ctx.tick.value === 0 ? '#333' : '#f0f0f0' }
                    }
                },
                plugins: {
                    legend: { display: false },
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `月次収支: ${this.formatCurrency(ctx.parsed.y)}`
                        }
                    }
                }
            }
        });
    }

    renderLoanTrendChart(records) {
        const canvas = document.getElementById('loan-trend-chart');
        const ctx = canvas.getContext('2d');
        if (this.charts.loanTrend) this.charts.loanTrend.destroy();

        const loanAcc = this.accounts.find(a => a.id === 'smbc_loan');
        if (!loanAcc) return;

        const labels = records.map(r => r.yearMonth);
        const data = records.map(r => r.bs[loanAcc.id] || 0);

        // 予測線: 最後2点の傾きで延長
        let projectionLabels = [];
        let projectionData = [];
        if (records.length >= 2) {
            const lastBal = data[data.length - 1];
            const prevBal = data[data.length - 2];
            const decrease = prevBal - lastBal;

            if (decrease > 0 && lastBal > 0) {
                const monthsToZero = Math.ceil(lastBal / decrease);
                const cappedMonths = Math.min(monthsToZero, 60); // 最大5年先

                const lastYM = records[records.length - 1].yearMonth;
                let [py, pm] = lastYM.split('-').map(Number);

                for (let i = 1; i <= cappedMonths; i++) {
                    pm++;
                    if (pm > 12) { pm = 1; py++; }
                    projectionLabels.push(`${py}-${String(pm).padStart(2, '0')}`);
                    projectionData.push(Math.max(0, lastBal - decrease * i));
                }
            }
        }

        const allLabels = [...labels, ...projectionLabels];
        const actualData = [...data, ...new Array(projectionLabels.length).fill(null)];
        const projData = [...new Array(data.length - 1).fill(null), data[data.length - 1], ...projectionData];

        this.charts.loanTrend = new Chart(ctx, {
            type: 'line',
            data: {
                labels: allLabels,
                datasets: [
                    {
                        label: 'ローン残高',
                        data: actualData,
                        borderColor: '#ef4444',
                        backgroundColor: 'rgba(239, 68, 68, 0.1)',
                        fill: true,
                        tension: 0.3,
                        borderWidth: 3,
                        pointRadius: 5,
                        pointBackgroundColor: '#ef4444',
                        pointBorderColor: '#fff',
                        pointBorderWidth: 2
                    },
                    {
                        label: '予測',
                        data: projData,
                        borderColor: '#9ca3af',
                        borderDash: [8, 4],
                        fill: false,
                        tension: 0.3,
                        borderWidth: 2,
                        pointRadius: 0
                    }
                ]
            },
            options: {
                responsive: true,
                maintainAspectRatio: false,
                scales: {
                    y: {
                        min: 0,
                        ticks: { callback: (val) => `¥${(val / 10000).toFixed(0)}万` }
                    }
                },
                plugins: {
                    tooltip: {
                        callbacks: {
                            label: (ctx) => `${ctx.dataset.label}: ${this.formatCurrency(ctx.parsed.y)}`
                        }
                    }
                }
            }
        });
    }

    // ======================================
    // 設定タブ
    // ======================================
    renderSettings() {
        // ローン設定
        const loanOrigInput = document.getElementById('loan-original');
        if (this.loanOriginalBalance) loanOrigInput.value = this.loanOriginalBalance;
        document.getElementById('loan-rate').value = this.loanInterestRate;
        const loanRepayInput = document.getElementById('loan-monthly-repayment');
        if (loanRepayInput && this.loanMonthlyRepayment) loanRepayInput.value = this.loanMonthlyRepayment;

        // 口座リスト
        const accountList = document.getElementById('account-list');
        accountList.innerHTML = '';
        this.accounts.forEach(acc => {
            const item = document.createElement('div');
            item.className = 'account-list-item';
            item.innerHTML = `
                <span class="list-item-icon">${acc.icon}</span>
                <span class="list-item-name">${acc.name}</span>
                <span class="list-item-type ${acc.type}">${acc.type === 'asset' ? '資産' : '負債'}</span>
                <button class="btn btn-danger btn-small" onclick="app.deleteAccount('${acc.id}')">🗑️</button>
            `;
            accountList.appendChild(item);
        });

        // カテゴリリスト
        const categoryList = document.getElementById('category-list');
        categoryList.innerHTML = '';
        const allCats = [
            ...this.plCategories.income.map(c => ({ ...c, catType: 'income' })),
            ...this.plCategories.expenses.map(c => ({ ...c, catType: 'expense' })),
            ...this.plCategories.reference.map(c => ({ ...c, catType: 'reference' }))
        ];
        allCats.forEach(cat => {
            const typeLabel = cat.catType === 'income' ? '収入' : cat.catType === 'expense' ? '支出' : '参考';
            const item = document.createElement('div');
            item.className = 'category-list-item';
            item.innerHTML = `
                <span class="list-item-icon">${cat.icon}</span>
                <span class="list-item-name">${cat.name}</span>
                ${cat.desc ? `<span class="list-item-desc">${cat.desc}</span>` : ''}
                <span class="list-item-type ${cat.catType}">${typeLabel}</span>
                <button class="btn btn-danger btn-small" onclick="app.deleteCategory('${cat.id}', '${cat.catType}')">🗑️</button>
            `;
            categoryList.appendChild(item);
        });

        // 予算設定
        this.renderBudgetSettings();

        // 目標リスト
        this.renderGoalList();

        // データ統計
        const dataStats = document.getElementById('data-stats');
        dataStats.innerHTML = `
            <p>📊 登録済み月数: ${this.monthlyRecords.length}ヶ月</p>
            <p>🏦 口座数: ${this.accounts.length}</p>
            <p>💰 カテゴリ数: ${allCats.length}</p>
        `;
    }

    saveLoanSettings() {
        const original = parseInt(document.getElementById('loan-original').value);
        const rate = parseFloat(document.getElementById('loan-rate').value);
        const repayment = parseInt(document.getElementById('loan-monthly-repayment').value);

        if (original && original > 0) this.loanOriginalBalance = original;
        if (rate && rate > 0) this.loanInterestRate = rate;
        this.loanMonthlyRepayment = (repayment && repayment > 0) ? repayment : null;

        this.isDirty = true;
        this.updateSaveStatus();
        this.showStatus('success', '✅', 'ローン設定を保存しました。');
        this.renderDashboard();
    }

    addAccount() {
        const name = document.getElementById('new-account-name').value.trim();
        const type = document.getElementById('new-account-type').value;
        const icon = document.getElementById('new-account-icon').value;

        if (!name) { alert('口座名を入力してください。'); return; }

        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
        this.accounts.push({ id, name, type, icon });
        document.getElementById('new-account-name').value = '';
        this.showStatus('success', '✅', `口座「${name}」を追加しました。`);
        this.renderSettings();
    }

    deleteAccount(id) {
        const acc = this.accounts.find(a => a.id === id);
        if (!acc) return;
        if (!confirm(`「${acc.name}」を削除しますか？\n※既存データからは削除されません。`)) return;

        this.accounts = this.accounts.filter(a => a.id !== id);
        this.showStatus('info', 'ℹ️', `口座「${acc.name}」を削除しました。`);
        this.renderSettings();
    }

    addCategory() {
        const name = document.getElementById('new-category-name').value.trim();
        const type = document.getElementById('new-category-type').value;
        const icon = document.getElementById('new-category-icon').value;
        const desc = document.getElementById('new-category-desc').value.trim();

        if (!name) { alert('カテゴリ名を入力してください。'); return; }

        const id = name.toLowerCase().replace(/[^a-z0-9]/g, '_') + '_' + Date.now();
        const cat = { id, name, icon, desc };

        if (type === 'income') this.plCategories.income.push(cat);
        else if (type === 'expense') this.plCategories.expenses.push(cat);
        else this.plCategories.reference.push(cat);

        document.getElementById('new-category-name').value = '';
        document.getElementById('new-category-desc').value = '';
        this.showStatus('success', '✅', `カテゴリ「${name}」を追加しました。`);
        this.renderSettings();
    }

    deleteCategory(id, catType) {
        let cat;
        if (catType === 'income') {
            cat = this.plCategories.income.find(c => c.id === id);
            if (!cat) return;
            if (!confirm(`「${cat.name}」を削除しますか？`)) return;
            this.plCategories.income = this.plCategories.income.filter(c => c.id !== id);
        } else if (catType === 'expense') {
            cat = this.plCategories.expenses.find(c => c.id === id);
            if (!cat) return;
            if (!confirm(`「${cat.name}」を削除しますか？`)) return;
            this.plCategories.expenses = this.plCategories.expenses.filter(c => c.id !== id);
        } else {
            cat = this.plCategories.reference.find(c => c.id === id);
            if (!cat) return;
            if (!confirm(`「${cat.name}」を削除しますか？`)) return;
            this.plCategories.reference = this.plCategories.reference.filter(c => c.id !== id);
        }

        this.showStatus('info', 'ℹ️', `カテゴリ「${cat.name}」を削除しました。`);
        this.renderSettings();
    }

    // ======================================
    // A1: 月ナビゲーション
    // ======================================
    navigateMonth(prefix, direction) {
        let yearId, monthId, callback;
        if (prefix === 'dashboard') {
            yearId = 'dashboard-year'; monthId = 'dashboard-month';
            callback = () => this.renderDashboard();
        } else if (prefix === 'bs-detail') {
            yearId = 'bs-detail-year'; monthId = 'bs-detail-month';
            callback = () => this.renderBSDetail();
        } else if (prefix === 'pl-detail') {
            yearId = 'pl-detail-year'; monthId = 'pl-detail-month';
            callback = () => this.renderPLDetail();
        } else if (prefix === 'input') {
            yearId = 'input-year'; monthId = 'input-month';
            callback = () => this.onInputDateChange();
        } else return;

        const yearSel = document.getElementById(yearId);
        const monthSel = document.getElementById(monthId);
        let y = parseInt(yearSel.value);
        let m = parseInt(monthSel.value);

        m += direction;
        if (m > 12) { m = 1; y++; }
        if (m < 1) { m = 12; y--; }

        // 年が選択肢にあるか確認
        const yearOpt = yearSel.querySelector(`option[value="${y}"]`);
        if (!yearOpt) return;

        yearSel.value = y;
        monthSel.value = m;
        callback();
    }

    // ======================================
    // A5: 保存状態表示
    // ======================================
    updateSaveStatus() {
        const timeEl = document.getElementById('last-save-time');
        const dirtyEl = document.getElementById('dirty-indicator');

        if (this.lastSavedAt) {
            const d = this.lastSavedAt;
            const timeStr = `${d.getFullYear()}/${String(d.getMonth()+1).padStart(2,'0')}/${String(d.getDate()).padStart(2,'0')} ${String(d.getHours()).padStart(2,'0')}:${String(d.getMinutes()).padStart(2,'0')}`;
            timeEl.textContent = `最終保存: ${timeStr}`;
        }

        dirtyEl.style.display = this.isDirty ? 'inline' : 'none';
    }

    // ======================================
    // A3: CSVエクスポート
    // ======================================
    exportToCSV() {
        const records = this.getSortedRecords();
        if (records.length === 0) {
            alert('エクスポートするデータがありません。');
            return;
        }

        const allAccounts = this.accounts;
        const allCategories = [...this.plCategories.income, ...this.plCategories.expenses, ...this.plCategories.reference];

        // ヘッダー
        const headers = ['年月', ...allAccounts.map(a => `[BS]${a.name}`), ...allCategories.map(c => `[PL]${c.name}`), '純資産', '月次損益', 'メモ'];

        const rows = records.map(r => {
            const totals = this.calcTotals(r);
            return [
                r.yearMonth,
                ...allAccounts.map(a => r.bs[a.id] || 0),
                ...allCategories.map(c => r.pl[c.id] || 0),
                totals.netWorth,
                totals.monthlyCashFlow,
                `"${(r.memo || '').replace(/"/g, '""')}"`
            ];
        });

        const bom = '\uFEFF';
        const csv = bom + [headers.join(','), ...rows.map(r => r.join(','))].join('\n');

        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `finance_export_${new Date().toISOString().slice(0,10)}.csv`;
        a.click();
        URL.revokeObjectURL(url);

        this.showStatus('success', '✅', 'CSVファイルをエクスポートしました。');
    }

    // ======================================
    // A4: 入力バリデーション
    // ======================================
    validateInput(inputEl) {
        const val = inputEl.value;
        const row = inputEl.closest('.account-input-row');
        let existingMsg = row.querySelector('.validation-msg');

        // 前のメッセージを削除
        if (existingMsg) existingMsg.remove();
        inputEl.classList.remove('input-warning', 'input-error');

        if (val === '') return;

        const num = Number(val);
        if (isNaN(num)) {
            inputEl.classList.add('input-error');
            const msg = document.createElement('div');
            msg.className = 'validation-msg error';
            msg.textContent = '数値を入力してください';
            row.appendChild(msg);
            return;
        }

        if (num < 0) {
            inputEl.classList.add('input-warning');
            const msg = document.createElement('div');
            msg.className = 'validation-msg';
            msg.textContent = '負の値が入力されています';
            row.appendChild(msg);
            return;
        }

        // 前月比で大幅変動の警告
        const id = inputEl.dataset.id;
        const type = inputEl.dataset.type;
        const yearMonth = this.getSelectedInputYearMonth();
        const prevRecord = this.getPreviousRecord(yearMonth);
        if (prevRecord) {
            const prevVal = type === 'bs' ? (prevRecord.bs[id] || 0) : (prevRecord.pl[id] || 0);
            if (prevVal > 0) {
                const changeRatio = Math.abs(num - prevVal) / prevVal;
                if (changeRatio > 3) {
                    inputEl.classList.add('input-warning');
                    const msg = document.createElement('div');
                    msg.className = 'validation-msg';
                    msg.textContent = `前月比 ${Math.round(changeRatio * 100)}% の変動があります`;
                    row.appendChild(msg);
                }
            }
        }
    }

    // ======================================
    // B1: スパークライン
    // ======================================
    renderSparklines() {
        const records = this.getSortedRecords();
        if (records.length < 2) {
            // データが1つ以下なら空表示
            ['sparkline-net-worth', 'sparkline-total-assets', 'sparkline-total-liabilities', 'sparkline-monthly-flow'].forEach(id => {
                document.getElementById(id).innerHTML = '';
            });
            return;
        }

        const last6 = records.slice(-6);
        const nwData = last6.map(r => this.calcTotals(r).netWorth);
        const taData = last6.map(r => this.calcTotals(r).totalAssets);
        const tlData = last6.map(r => this.calcTotals(r).totalLiabilities);
        const cfData = last6.map(r => this.calcTotals(r).monthlyCashFlow);

        this.renderSparkline('sparkline-net-worth', nwData, '#667eea');
        this.renderSparkline('sparkline-total-assets', taData, '#10b981');
        this.renderSparkline('sparkline-total-liabilities', tlData, '#ef4444');
        this.renderSparkline('sparkline-monthly-flow', cfData, '#8b5cf6');
    }

    renderSparkline(containerId, values, color) {
        const container = document.getElementById(containerId);
        if (!container || values.length < 2) { if (container) container.innerHTML = ''; return; }

        const w = 120, h = 28, pad = 2;
        const min = Math.min(...values);
        const max = Math.max(...values);
        const range = max - min || 1;

        const points = values.map((v, i) => {
            const x = pad + (i / (values.length - 1)) * (w - pad * 2);
            const y = h - pad - ((v - min) / range) * (h - pad * 2);
            return `${x},${y}`;
        });

        container.innerHTML = `<svg viewBox="0 0 ${w} ${h}" preserveAspectRatio="none">
            <polyline points="${points.join(' ')}" fill="none" stroke="${color}" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"/>
            <circle cx="${points[points.length-1].split(',')[0]}" cy="${points[points.length-1].split(',')[1]}" r="3" fill="${color}"/>
        </svg>`;
    }

    // ======================================
    // B4: 前月比バッジ
    // ======================================
    renderPercentageBadges(totals, prevTotals) {
        const badges = [
            { id: 'badge-net-worth', cur: totals.netWorth, prev: prevTotals?.netWorth },
            { id: 'badge-total-assets', cur: totals.totalAssets, prev: prevTotals?.totalAssets },
            { id: 'badge-total-liabilities', cur: totals.totalLiabilities, prev: prevTotals?.totalLiabilities },
            { id: 'badge-monthly-flow', cur: totals.monthlyCashFlow, prev: prevTotals?.monthlyCashFlow }
        ];

        badges.forEach(({ id, cur, prev }) => {
            const el = document.getElementById(id);
            if (!el) return;

            if (prev === undefined || prev === null) {
                el.textContent = '';
                el.className = 'pct-badge';
                return;
            }

            if (prev === 0) {
                el.textContent = cur === 0 ? '±0' : cur > 0 ? '+∞' : '-∞';
                el.className = 'pct-badge ' + (cur >= 0 ? 'badge-up' : 'badge-down');
                return;
            }

            const pct = Math.round(((cur - prev) / Math.abs(prev)) * 100);
            if (pct > 0) {
                el.textContent = `+${pct}%`;
                el.className = 'pct-badge badge-up';
            } else if (pct < 0) {
                el.textContent = `${pct}%`;
                el.className = 'pct-badge badge-down';
            } else {
                el.textContent = '±0%';
                el.className = 'pct-badge badge-flat';
            }
        });
    }

    // ======================================
    // B3: ローン完済カウントダウン
    // ======================================
    renderLoanCountdown(record) {
        const container = document.getElementById('loan-countdown');
        if (!container) return;

        const loanAcc = this.accounts.find(a => a.id === 'smbc_loan');
        if (!loanAcc || !record || (record.bs[loanAcc.id] || 0) === 0) {
            container.innerHTML = '';
            return;
        }

        const balance = record.bs[loanAcc.id];
        const monthlyInterest = Math.round(balance * (this.loanInterestRate / 100) / 12);
        const original = this.loanOriginalBalance || balance;
        const paidOff = original - balance;

        // 月々の返済額を推定（実績 → 設定値 の優先順）
        const sortedRecords = this.getSortedRecords();
        let monthlyRepayment = 0;
        let repaymentSource = '';
        if (sortedRecords.length >= 2) {
            const last = sortedRecords[sortedRecords.length - 1];
            const prev = sortedRecords[sortedRecords.length - 2];
            const lastBal = last.bs[loanAcc.id] || 0;
            const prevBal = prev.bs[loanAcc.id] || 0;
            if (prevBal > lastBal) {
                monthlyRepayment = prevBal - lastBal;
                repaymentSource = '実績値';
            }
        }
        // 実績が取れなければ設定値にフォールバック
        if (monthlyRepayment === 0 && this.loanMonthlyRepayment && this.loanMonthlyRepayment > 0) {
            monthlyRepayment = this.loanMonthlyRepayment;
            repaymentSource = '設定値';
        }

        const principalPay = monthlyRepayment - monthlyInterest;
        let monthsLeft = 0;
        let targetDate = '';
        if (principalPay > 0) {
            monthsLeft = Math.ceil(balance / principalPay);
            const now = new Date();
            const target = new Date(now.getFullYear(), now.getMonth() + monthsLeft, 1);
            targetDate = `${target.getFullYear()}年${target.getMonth() + 1}月`;
        }

        const noData = monthsLeft === 0;
        const sourceLabel = repaymentSource ? `（${repaymentSource}ベース）` : '';
        container.innerHTML = `
            <div class="countdown-main">${noData ? '⚙️ 設定タブで月々の返済額を入力してください' : `あと約 ${monthsLeft}ヶ月 ${sourceLabel}`}</div>
            <div class="countdown-sub">${targetDate ? `完済予定: ${targetDate}` : (noData ? '返済額の設定で完済予測を表示できます' : '')}</div>
            <div class="countdown-progress">
                <div class="countdown-stat">
                    <div class="countdown-stat-value">${this.formatCurrency(paidOff)}</div>
                    <div class="countdown-stat-label">返済済み</div>
                </div>
                <div class="countdown-stat">
                    <div class="countdown-stat-value">${this.formatCurrency(balance)}</div>
                    <div class="countdown-stat-label">残高</div>
                </div>
                <div class="countdown-stat">
                    <div class="countdown-stat-value">${this.formatCurrency(monthlyInterest)}</div>
                    <div class="countdown-stat-label">月間利息</div>
                </div>
            </div>
        `;
    }

    // ======================================
    // C1: 予算進捗
    // ======================================
    renderBudgetProgress(record) {
        const container = document.getElementById('budget-progress');
        const section = document.getElementById('budget-section');
        if (!container || !section) return;

        const hasBudgets = Object.keys(this.budgets).some(k => this.budgets[k] > 0);
        if (!hasBudgets) {
            section.style.display = 'none';
            return;
        }
        section.style.display = '';

        let html = '';
        this.plCategories.expenses.forEach(cat => {
            const budget = this.budgets[cat.id];
            if (!budget || budget <= 0) return;

            const actual = record ? (record.pl[cat.id] || 0) : 0;
            const pct = Math.round((actual / budget) * 100);
            const barClass = pct > 100 ? 'danger' : pct > 80 ? 'warning' : 'safe';

            html += `
                <div class="budget-progress-item">
                    <div class="budget-progress-header">
                        <span class="budget-progress-name">${cat.icon} ${cat.name}</span>
                        <span class="budget-progress-values">${this.formatCurrency(actual)} / ${this.formatCurrency(budget)}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-bar-fill ${barClass}" style="width: ${Math.min(pct, 100)}%"></div>
                    </div>
                    <div class="budget-progress-pct">${pct}%${pct > 100 ? ' (予算超過!)' : ''}</div>
                </div>
            `;
        });

        container.innerHTML = html || '<p class="empty-state">予算が設定されていません</p>';
    }

    // ======================================
    // C2: 目標進捗
    // ======================================
    renderGoalProgress() {
        const container = document.getElementById('goal-progress');
        const section = document.getElementById('goal-section');
        if (!container || !section) return;

        if (this.goals.length === 0) {
            section.style.display = 'none';
            return;
        }
        section.style.display = '';

        const latestRecord = this.getSortedRecords().slice(-1)[0];
        const totals = latestRecord ? this.calcTotals(latestRecord) : null;

        let html = '';
        this.goals.forEach(goal => {
            let current = 0;
            let pct = 0;

            if (goal.type === 'loan_payoff') {
                const loanAcc = this.accounts.find(a => a.id === 'smbc_loan');
                const original = this.loanOriginalBalance || (latestRecord ? (latestRecord.bs[loanAcc?.id] || 0) : 0);
                const remaining = latestRecord && loanAcc ? (latestRecord.bs[loanAcc.id] || 0) : original;
                current = original - remaining;
                pct = original > 0 ? Math.round((current / original) * 100) : 0;
            } else if (goal.type === 'savings') {
                current = totals ? totals.totalAssets : 0;
                pct = goal.targetAmount > 0 ? Math.round((current / goal.targetAmount) * 100) : 0;
            }

            const deadlineText = goal.targetDate ? `目標: ${goal.targetDate}` : '';

            html += `
                <div class="goal-progress-item">
                    <div class="goal-progress-header">
                        <span class="goal-progress-name">🎯 ${goal.name}</span>
                        <span class="goal-progress-values">${this.formatCurrency(current)} / ${this.formatCurrency(goal.targetAmount)}</span>
                    </div>
                    <div class="progress-bar">
                        <div class="progress-bar-fill goal" style="width: ${Math.min(pct, 100)}%"></div>
                    </div>
                    <div class="goal-progress-pct">${pct}% ${deadlineText}</div>
                </div>
            `;
        });

        container.innerHTML = html;
    }

    // ======================================
    // 年間サマリー初期化・描画
    // ======================================
    initYearlyDateSelector() {
        const yearSel = document.getElementById('yearly-year');
        const now = new Date();
        const curYear = now.getFullYear();
        for (let y = curYear - 3; y <= curYear + 1; y++) {
            const opt = document.createElement('option');
            opt.value = y; opt.textContent = `${y}年`;
            if (y === curYear) opt.selected = true;
            yearSel.appendChild(opt);
        }
    }

    renderYearlySummary() {
        const year = parseInt(document.getElementById('yearly-year').value);
        this.renderHeatmapCalendar(year);
        this.renderYearlySummaryTable(year);
        this.initComparisonSelectors();
    }

    // ======================================
    // B5: ヒートマップカレンダー
    // ======================================
    renderHeatmapCalendar(year) {
        const container = document.getElementById('heatmap-calendar');
        if (!container) return;

        let html = '';
        for (let m = 1; m <= 12; m++) {
            const ym = `${year}-${String(m).padStart(2, '0')}`;
            const record = this.getRecord(ym);
            const totals = record ? this.calcTotals(record) : null;

            let cellClass = 'heatmap-empty';
            let valueText = '--';

            if (totals) {
                const cf = totals.monthlyCashFlow;
                if (cf > 0) cellClass = 'heatmap-positive';
                else if (cf < 0) cellClass = 'heatmap-negative';
                else cellClass = 'heatmap-zero';
                valueText = this.formatCurrency(cf);
            }

            html += `
                <div class="heatmap-cell ${cellClass}">
                    <div class="heatmap-month">${m}月</div>
                    <div class="heatmap-value">${valueText}</div>
                </div>
            `;
        }

        html += `<div class="heatmap-legend" style="grid-column: 1 / -1;">
            <div class="heatmap-legend-item"><div class="heatmap-legend-color" style="background:#ecfdf5;border-color:#a7f3d0;"></div>黒字</div>
            <div class="heatmap-legend-item"><div class="heatmap-legend-color" style="background:#fef2f2;border-color:#fecaca;"></div>赤字</div>
            <div class="heatmap-legend-item"><div class="heatmap-legend-color" style="background:#fafafa;border-color:#f3f4f6;"></div>データなし</div>
        </div>`;

        container.innerHTML = html;
    }

    // ======================================
    // B2+C4: 年間サマリーテーブル
    // ======================================
    renderYearlySummaryTable(year) {
        const tbody = document.getElementById('yearly-table-body');
        if (!tbody) return;

        let yearTotalIncome = 0, yearTotalExpenses = 0;
        let html = '';

        for (let m = 1; m <= 12; m++) {
            const ym = `${year}-${String(m).padStart(2, '0')}`;
            const record = this.getRecord(ym);

            if (!record) {
                html += `<tr><td>${m}月</td><td class="no-data" colspan="6">--</td></tr>`;
                continue;
            }

            const t = this.calcTotals(record);
            yearTotalIncome += t.totalIncome;
            yearTotalExpenses += t.totalExpenses;

            const cfClass = t.monthlyCashFlow >= 0 ? 'text-positive' : 'text-negative';
            const nwClass = t.netWorth >= 0 ? 'text-positive' : 'text-negative';

            html += `<tr>
                <td>${m}月</td>
                <td>${this.formatCurrency(t.totalAssets)}</td>
                <td>${this.formatCurrency(t.totalLiabilities)}</td>
                <td class="${nwClass}">${this.formatCurrency(t.netWorth)}</td>
                <td>${this.formatCurrency(t.totalIncome)}</td>
                <td>${this.formatCurrency(t.totalExpenses)}</td>
                <td class="${cfClass}">${this.formatCurrency(t.monthlyCashFlow)}</td>
            </tr>`;
        }

        // 年間合計行
        const yearFlow = yearTotalIncome - yearTotalExpenses;
        const yfClass = yearFlow >= 0 ? 'text-positive' : 'text-negative';
        html += `<tr class="year-total">
            <td>年間合計</td>
            <td>--</td><td>--</td><td>--</td>
            <td>${this.formatCurrency(yearTotalIncome)}</td>
            <td>${this.formatCurrency(yearTotalExpenses)}</td>
            <td class="${yfClass}">${this.formatCurrency(yearFlow)}</td>
        </tr>`;

        tbody.innerHTML = html;
    }

    // ======================================
    // C3: 2ヶ月比較
    // ======================================
    initComparisonSelectors() {
        const sel1 = document.getElementById('compare-month1');
        const sel2 = document.getElementById('compare-month2');
        if (!sel1 || !sel2) return;

        const records = this.getSortedRecords();
        const options = records.map(r => `<option value="${r.yearMonth}">${r.yearMonth}</option>`).join('');

        sel1.innerHTML = options;
        sel2.innerHTML = options;

        // デフォルト: 最後の2つ
        if (records.length >= 2) {
            sel1.value = records[records.length - 2].yearMonth;
            sel2.value = records[records.length - 1].yearMonth;
        }
    }

    renderComparison() {
        const ym1 = document.getElementById('compare-month1').value;
        const ym2 = document.getElementById('compare-month2').value;
        const container = document.getElementById('comparison-result');
        if (!container || !ym1 || !ym2) return;

        const r1 = this.getRecord(ym1);
        const r2 = this.getRecord(ym2);
        if (!r1 || !r2) {
            container.innerHTML = '<p class="empty-state">比較するデータがありません</p>';
            return;
        }

        const t1 = this.calcTotals(r1);
        const t2 = this.calcTotals(r2);

        const diffCell = (v1, v2) => {
            const d = v2 - v1;
            const cls = d > 0 ? 'up' : d < 0 ? 'down' : 'flat';
            const text = d > 0 ? `+${this.formatCurrency(d)}` : d < 0 ? `${this.formatCurrency(d)}` : '±0';
            return `<td class="comp-diff ${cls}">${text}</td>`;
        };

        let html = `<table class="comparison-table">
            <thead><tr><th>項目</th><th>${ym1}</th><th>${ym2}</th><th>差分</th></tr></thead>
            <tbody>
            <tr class="section-header"><td colspan="4">BS（貸借対照表）</td></tr>`;

        // BS各口座
        this.accounts.forEach(acc => {
            const v1 = r1.bs[acc.id] || 0;
            const v2 = r2.bs[acc.id] || 0;
            html += `<tr><td>${acc.icon} ${acc.name}</td><td>${this.formatCurrency(v1)}</td><td>${this.formatCurrency(v2)}</td>${diffCell(v1, v2)}</tr>`;
        });

        // BS合計
        html += `<tr style="font-weight:600"><td>純資産</td><td>${this.formatCurrency(t1.netWorth)}</td><td>${this.formatCurrency(t2.netWorth)}</td>${diffCell(t1.netWorth, t2.netWorth)}</tr>`;

        html += `<tr class="section-header"><td colspan="4">PL（損益計算書）</td></tr>`;

        // PL各カテゴリ
        [...this.plCategories.income, ...this.plCategories.expenses].forEach(cat => {
            const v1 = r1.pl[cat.id] || 0;
            const v2 = r2.pl[cat.id] || 0;
            html += `<tr><td>${cat.icon} ${cat.name}</td><td>${this.formatCurrency(v1)}</td><td>${this.formatCurrency(v2)}</td>${diffCell(v1, v2)}</tr>`;
        });

        // PL合計
        html += `<tr style="font-weight:600"><td>月次損益</td><td>${this.formatCurrency(t1.monthlyCashFlow)}</td><td>${this.formatCurrency(t2.monthlyCashFlow)}</td>${diffCell(t1.monthlyCashFlow, t2.monthlyCashFlow)}</tr>`;

        html += `</tbody></table>`;
        container.innerHTML = html;
    }

    // ======================================
    // 予算設定（設定タブ）
    // ======================================
    saveBudgetSettings() {
        this.plCategories.expenses.forEach(cat => {
            const input = document.getElementById(`budget-${cat.id}`);
            if (input) {
                const val = parseInt(input.value) || 0;
                if (val > 0) this.budgets[cat.id] = val;
                else delete this.budgets[cat.id];
            }
        });
        this.isDirty = true;
        this.updateSaveStatus();
        this.showStatus('success', '✅', '予算設定を保存しました。');
        this.renderDashboard();
    }

    renderBudgetSettings() {
        const container = document.getElementById('budget-settings-list');
        if (!container) return;

        let html = '';
        this.plCategories.expenses.forEach(cat => {
            const val = this.budgets[cat.id] || '';
            html += `
                <div class="budget-setting-item">
                    <span class="budget-cat-name">${cat.icon} ${cat.name}</span>
                    <input type="number" id="budget-${cat.id}" value="${val}" placeholder="0" min="0">
                    <span class="budget-unit">円/月</span>
                </div>
            `;
        });
        container.innerHTML = html;
    }

    // ======================================
    // 目標設定（設定タブ）
    // ======================================
    addGoal() {
        const name = document.getElementById('new-goal-name').value.trim();
        const type = document.getElementById('new-goal-type').value;
        const target = parseInt(document.getElementById('new-goal-target').value) || 0;
        const date = document.getElementById('new-goal-date').value;

        if (!name) { alert('目標名を入力してください。'); return; }
        if (target <= 0) { alert('目標金額を入力してください。'); return; }

        this.goals.push({
            id: 'goal_' + Date.now(),
            name: name,
            type: type,
            targetAmount: target,
            targetDate: date || null
        });

        document.getElementById('new-goal-name').value = '';
        document.getElementById('new-goal-target').value = '';
        document.getElementById('new-goal-date').value = '';

        this.isDirty = true;
        this.updateSaveStatus();
        this.showStatus('success', '✅', `目標「${name}」を追加しました。`);
        this.renderSettings();
    }

    deleteGoal(id) {
        const goal = this.goals.find(g => g.id === id);
        if (!goal) return;
        if (!confirm(`目標「${goal.name}」を削除しますか？`)) return;

        this.goals = this.goals.filter(g => g.id !== id);
        this.isDirty = true;
        this.updateSaveStatus();
        this.showStatus('info', 'ℹ️', `目標「${goal.name}」を削除しました。`);
        this.renderSettings();
    }

    renderGoalList() {
        const container = document.getElementById('goal-list');
        if (!container) return;

        if (this.goals.length === 0) {
            container.innerHTML = '<p class="empty-state">目標が設定されていません</p>';
            return;
        }

        let html = '';
        this.goals.forEach(goal => {
            const typeLabel = goal.type === 'loan_payoff' ? 'ローン完済' : '貯蓄目標';
            html += `
                <div class="goal-list-item">
                    <div class="goal-info">
                        <div class="goal-name">🎯 ${goal.name}</div>
                        <div class="goal-detail">${typeLabel} | 目標: ${this.formatCurrency(goal.targetAmount)}${goal.targetDate ? ` | 期限: ${goal.targetDate}` : ''}</div>
                    </div>
                    <button class="btn btn-danger btn-small" onclick="app.deleteGoal('${goal.id}')">🗑️</button>
                </div>
            `;
        });
        container.innerHTML = html;
    }
}

// アプリケーションを初期化
const app = new FinanceApp();
