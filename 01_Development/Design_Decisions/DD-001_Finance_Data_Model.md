# Design Decision #001：LifeOS 財務模組核心資料模型

## 背景
重新定義財務模組資料模型，區分 Facts、Intentions、Insights。

## 一、資產/負債
遵循財務定義，不因用途改變本質。

## 二、用途（Purpose）
描述資金在人生中的角色，例如薪資收入、生活資金、家庭責任、旅遊基金。

## 三、資產類型（Asset Type）
現金、銀行存款、股票、ETF、基金、保單、加密貨幣、其他。

## 四、可自由運用資金（Available Funds）
概念：可動用資產－已預留用途資金－已形成付款義務未支付金額。

## 五、三層架構
### Facts
帳戶、金額、資產/負債、資產類型。
### Intentions
Purpose。
### Insights
總資產、總負債、淨資產、可自由運用資金等。

## 核心理念
> 使用者輸入的是生活（Facts+Intentions），LifeOS輸出的是理解（Insights）。

> LifeOS財務模組不是管理金錢，而是管理每一筆資金在人生中的使命。