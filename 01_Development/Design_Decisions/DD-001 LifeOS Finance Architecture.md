---
Document ID: DD-001
Title: Finance Data Model
Status: Accepted
Version: 1.0
Created: 2026-07-22
Last Updated: 2026-07-22
Author: LifeOS Team (User + ChatGPT)
Project: LifeOS
Module: Finance
Related Documents:
  - 02_LifeOS Manifesto
  - 03_LifeOS Current Project Context
  - Development Log
---

# Design Decision #001
# Finance Data Model

---

# Summary

本次設計決策重新定義了 LifeOS 財務模組的核心資料模型。

財務模組不再以傳統記帳或會計系統作為主要設計方向，而是以「協助使用者理解自己的財務結構」為核心目標。

本次決策建立了三個重要概念：

- Facts（財務事實）
- Intentions（人生規劃）
- Insights（系統洞察）

並新增「Available Funds（可自由運用資金）」作為財務模組的重要分析指標。

本決策將作為未來所有財務功能的最高設計原則。

---

# Background

LifeOS 財務模組最初的目的，並不是打造另一套記帳 App。

市場上已有許多成熟的記帳工具，它們能夠完整記錄收入、支出、分類與報表。

然而，在整理自己多年來的財務狀況時，我們發現真正的問題並不是「沒有記錄」，而是「缺乏理解」。

多年來，所有收入都會依照習慣分配到不同銀行帳戶。

例如：

- 薪資帳戶
- 日常生活帳戶
- 保費預留帳戶
- 家庭支出帳戶
- 投資帳戶

從記帳角度來看，每一筆資金都有明確流向。

但回頭檢視時卻發現，即使每個月都有固定分配資金，仍然長期無法建立真正的資產，也始終存不到理想中的緊急預備金。

真正的問題不是不知道錢花到哪裡。

而是不知道：

> **目前自己的財務結構，到底代表什麼？**

因此，LifeOS 財務模組的設計方向開始從「記錄交易」逐漸轉向「理解財務」。

我們希望系統回答的不只是：

- 今天花了多少錢？
- 本月收入多少？

而是：

- 我真正擁有多少資產？
- 哪些資金其實早已有既定用途？
- 我現在真正可以自由決策的資金有多少？
- 我的資產是否正在逐漸增加？
- 我的財務結構是否朝向理想的人生前進？

這也是本次重新設計財務模組的起點。

---

# Problem Statement

在重新整理所有銀行帳戶用途時，我們發現一個重要問題。

過去習慣將不同銀行依照用途區分，例如：

- 薪資帳戶
- 保費帳戶
- 家庭支出帳戶
- 投資帳戶
- 日常消費帳戶

然而，在建立資料模型時，開始出現一個疑問：

> 「生活資金、固定支出、家庭責任，是否應該直接歸類為負債？」

乍看之下，這個想法似乎合理。

因為這些資金最終都會被支出。

例如：

- 保費一定會扣款。
- 信用卡一定要繳。
- 家庭支出一定會支付。
- 日本旅遊基金未來一定會花掉。

但進一步分析後，我們發現這樣的分類會造成財務概念混亂。

原因在於：

「用途（Purpose）」與「財務本質（Asset / Liability）」其實回答的是完全不同的問題。

如果因為未來會花掉，就把資金直接視為負債，將導致：

- 所有存款都可能變成負債。
- 所有旅遊基金都可能變成負債。
- 所有生活費都可能變成負債。

如此一來，資產與負債將失去原本的定義，也無法真實反映使用者的財務狀態。

因此，我們重新檢視整個資料模型，並決定將「用途」與「財務本質」完全分離。

這也成為本次 Design Decision 最重要的核心問題。

---

# Options Considered

在討論過程中，我們曾考慮過數種不同設計方式。

## Option A — 用途直接決定資產／負債

概念：

只要未來一定會支出的資金，就直接視為負債。

例如：

- 保費基金 → 負債
- 日本旅遊基金 → 負債
- 家庭支出 → 負債

### 優點

- 看似容易理解。
- 不需要建立額外欄位。

### 缺點

違反財務定義。

資金是否具有用途，並不改變其財務本質。

一筆銀行存款，不會因為未來要拿去旅行，就不再屬於資產。

因此，本方案不採用。

---

## Option B — 資產／負債與用途完全分離（Accepted）

概念：

財務本質維持客觀定義。

用途則由另一個獨立欄位描述。

例如：

資產：

- 銀行存款

Purpose：

- 日本旅遊
- 保費預留
- 家庭責任
- 緊急預備金

如此一來：

財務資料保持一致。

人生規劃也能完整保留。

經討論後，本方案被正式採用，並作為後續財務模組的核心資料模型。

---

# Decision

經過討論後，我們正式決定：

LifeOS 財務模組將採用「多層次資料模型（Multi-layer Financial Model）」。

所有財務資訊都應依照其真正的角色進行分類，而不是混合不同層級的概念。

本次決策建立以下三個核心層級：

1. Facts（財務事實）
2. Intentions（人生規劃）
3. Insights（系統洞察）

三者彼此獨立，但互相關聯。

其中：

- Facts 描述客觀事實。
- Intentions 描述使用者賦予資金的目的。
- Insights 則由系統根據前兩者自動產生。

任何未來新增的財務功能，都不得破壞這三層結構。

---

# Design Principles

本次設計建立以下原則。

## Principle 1
### Facts 永遠描述事實

Facts 不應包含任何推論。

它只回答：

> 「目前真實存在什麼？」

例如：

- 銀行帳戶
- 現金
- 股票
- ETF
- 保單
- 信用卡欠款
- 房貸

Facts 必須保持客觀。

未來用途改變，也不應影響 Facts。

---

## Principle 2
### Intentions 永遠描述人生目的

Purpose 並不是財務分類。

Purpose 回答的是：

> 「這筆資金存在的目的。」

例如：

- 日常生活
- 日本旅遊
- 緊急預備金
- 家庭責任
- 保費預留
- 教育基金
- 長期投資

Purpose 可以改變。

資產本質則不會因此改變。

因此：

Purpose 不得參與資產／負債判斷。

---

## Principle 3
### Insights 永遠由系統產生

使用者不應直接輸入：

- 淨資產
- 資產比例
- 可自由運用資金

這些都屬於：

Insights。

LifeOS 的責任：

不是要求使用者輸入更多資料。

而是利用既有資料，

提供更好的理解。

因此：

Insights 必須由系統自動計算。

---

# Finance Data Model

LifeOS 財務模組正式採用以下資料架構。

```text
Facts
│
├── Accounts
├── Assets
├── Liabilities
├── Asset Type
└── Amount

↓

Intentions

├── Purpose
├── Goal
├── Priority
└── Tags

↓

Insights

├── Total Assets
├── Total Liabilities
├── Net Worth
├── Asset Allocation
├── Available Funds
└── Future Analysis
```

Facts 是資料來源。

Intentions 是人生規劃。

Insights 則是系統理解。

這三層共同構成 LifeOS 財務模組。

---

# Available Funds

本次設計最大的新增概念為：

> **Available Funds（可自由運用資金）。**

傳統記帳系統通常回答：

> 「你現在有多少錢？」

但 LifeOS 更希望回答：

> **「你現在真正能自由決策的資金有多少？」**

例如：

銀行餘額：

100,000 元

其中：

- 保費預留
- 家庭支出
- 信用卡預留
- 日本旅遊基金

皆已有明確用途。

因此：

真正可以自由決策的資金，

遠低於銀行帳戶顯示的餘額。

這也是 Available Funds 存在的原因。

它不是新的資產。

也不是新的負債。

而是一種：

> **根據 Facts 與 Intentions 推導出的 Insights。**

---

## Available Funds（Concept）

```text
Available Funds

=

可動用資產

－ 已預留用途資金

－ 已形成付款義務但尚未支付金額
```

本公式僅作為設計概念。

實際演算法可依未來需求逐步優化。

重要的是：

Available Funds 屬於系統洞察，

而不是使用者輸入資料。

---

# Consequences

本次設計將影響所有未來財務功能。

包括但不限於：

- 財務首頁
- 帳戶管理
- Purpose 管理
- 資產分析
- 投資分析
- 財務報表
- AI 財務建議

所有新功能都必須遵循：

Facts

↓

Intentions

↓

Insights

不得直接跨越層級。

例如：

不得直接由 Purpose 修改資產本質。

---

# Future Considerations

目前僅建立資料模型。

以下功能暫不納入本次設計：

- 預算管理
- 現金流預測
- 財務健康分數
- AI 財務教練
- 自動資產配置分析

上述功能皆應建立於本次資料模型之上。

未來若新增任何分析功能，

不得重新定義 Facts 與 Intentions。

---

# References

本設計決策參考以下專案文件：

- 02_LifeOS Manifesto
- 03_LifeOS Current Project Context
- Development Log
- 使用者真實銀行帳戶整理
- Finance Module 設計討論

---

# Philosophy

LifeOS 財務模組並不是在管理金錢。

它管理的是：

> **每一筆資金在人生中的使命。**

因此：

使用者輸入的是生活。

LifeOS 負責輸出理解。

真正重要的不是讓使用者記錄更多資料。

而是讓每一筆資料，都能產生真正有價值的洞察。

因此，本次設計正式建立：

> **Facts + Intentions → Insights**

作為 LifeOS 財務模組最高設計原則。

未來所有財務功能，

都應建立於此原則之上，而非重新定義它。