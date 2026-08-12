# Security Specification for FreshMarket ERP (Firebase Integration)

## 1. Data Invariants
* **Products**: `priceMin` (Menudeo), `priceMed` (Medio Mayoreo), and `priceMax` (Mayoreo) must always be positive numbers. Cost must be positive and lower than or equal to `priceMin`. Stock must not exceed `stockMax`.
* **Stock Movements**: Every movement must reference a valid `productId` and have positive quantity.
* **Sales**: The total must match the sum of items' totalPrice, and profit must be correctly calculated.
* **Cash Sessions**: There can only be one session marked as "Abierta" at a time, or at least any new session must be initialized with status "Abierta" and a positive `initialCash`.
* **Audit Logs**: Timestamps must be valid ISO strings and once created, audit logs are completely immutable.

## 2. The "Dirty Dozen" Payloads (Exploit Payloads Rejected by Rules)
1. **Product Cost Injection**: Product created with `cost` larger than `priceMin`.
2. **Infinite Stock**: Product created with `stock` greater than `stockMax`.
3. **Invalid ID Character**: Product created with ID `PROD$#@!` (special characters).
4. **Huge ID**: Product ID exceeding 128 characters (resource exhausting attack).
5. **Negative Sale Total**: Sale registered with negative total.
6. **Negative Gasto**: Cash expense with a negative amount.
7. **Bypassing Audit Mutability**: Attempting to edit/update an existing `auditLog` entry.
8. **Malicious Role Update**: User trying to change their role to "Administrador" without admin rights.
9. **Fake Supplier Balance**: Creating a supplier with an outstanding balance under negative value.
10. **Shadow Product Fields**: Creating a product containing unwhitelisted keys (e.g., `hacked: true`).
11. **Spoofed Auth**: Accessing collections without a valid session (`request.auth == null`).
12. **Future Timestamp**: Creating a log or movement with a future or client-faked timestamp instead of server time.

## 3. Conceptual Security Rules Test Runner
Tests verify that all "Dirty Dozen" payloads fail with `PERMISSION_DENIED` and that valid payloads succeed.
- `test_unauthenticated_blocked`: Unauthenticated users are strictly blocked from all reading/writing.
- `test_valid_product_creation`: Authenticated anonymous users can create products of correct schema size.
- `test_invalid_product_schema`: Product creations containing extra keys or incorrect data types are rejected.
- `test_audit_log_immutability`: Write/Update/Delete operations on existing audit logs are rejected.
