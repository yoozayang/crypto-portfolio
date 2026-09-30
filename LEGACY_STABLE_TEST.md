# Legacy → STABLE verification

Expected flow:
1. Record legacy asset sale to STABLE at the sale exchange.
2. Legacy source quantity decreases; tracked source cost/quantity is unchanged.
3. STABLE balance increases by the entered U amount.
4. Use Asset Flow separately to move STABLE between exchanges (for example MAX → Binance).
5. Later record STABLE → BTC/MSTR only when the purchase actually occurs.
