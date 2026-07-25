# Require active-book authorization for Floor fills

Every fill requires both the Trader's signed order and a short-lived authorization confirming that the order remains active in the House-operated book. This makes cancellation and re-quoting immediate and gas-free while preventing the House from inventing a maker price, in exchange for trusting the House for fill availability and censorship resistance.
