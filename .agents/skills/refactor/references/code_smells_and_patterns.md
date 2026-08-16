# Refactoring Reference: Code Smells, Patterns & Operations

Detailed catalog of common code smells, design pattern refactoring examples, and standard refactoring operations written in clean, language-agile pseudo-code.

---

## Common Code Smells & Fixes

### 1. Long Method / Function

```diff
# BAD: Single function executing sequential multi-step logic
- function processOrder(order_id):
-     # 50 lines: fetch order details from database
-     # 30 lines: validate payment & inventory
-     # 40 lines: calculate discounts & taxes
-     # 30 lines: reserve items in warehouse
-     # 20 lines: create shipping manifest
-     # 30 lines: dispatch confirmation emails

# GOOD: Main function orchestrating focused single-purpose helpers (Extract Method)
+ function processOrder(order_id):
+     order = fetchOrder(order_id)
+     validateOrder(order)
+     pricing = calculatePricing(order)
+     shipment = reserveAndShip(order)
+     sendNotifications(order, pricing, shipment)
+     return { order, pricing, shipment }
```

### 2. Duplicated Code

```diff
# BAD: Identical logic repeated across multiple functions
- function calculateUserDiscount(user):
-     if user.membership == "GOLD": return user.total * 0.20
-     if user.membership == "SILVER": return user.total * 0.10
-     return 0
-
- function calculateOrderDiscount(order):
-     if order.user.membership == "GOLD": return order.total * 0.20
-     if order.user.membership == "SILVER": return order.total * 0.10
-     return 0

# GOOD: Shared helper function (Extract Method / DRY)
+ function getDiscountRate(membership_type):
+     rates = { "GOLD": 0.20, "SILVER": 0.10 }
+     return rates.get(membership_type, 0)
+
+ function calculateUserDiscount(user):
+     return user.total * getDiscountRate(user.membership)
+
+ function calculateOrderDiscount(order):
+     return order.total * getDiscountRate(order.user.membership)
```

### 3. Large Class / Module (God Object)

```diff
# BAD: Monolithic class handling multiple domain concerns
- class UserManager:
-     createUser()
-     updateUser()
-     deleteUser()
-     sendEmailNotification()
-     generateBillingReport()
-     processPaymentInfo()
-     validateAddress()

# GOOD: Decomposed single-responsibility services (Extract Class / Service Separation)
+ class UserService:
+     createUser()
+     updateUser()
+     deleteUser()
+
+ class NotificationService:
+     sendEmail()
+
+ class PaymentService:
+     processPayment()
+
+ class ReportingService:
+     generateReport()
```

### 4. Long Parameter List

```diff
# BAD: Functions requiring an unwieldy number of positional arguments
- function createUser(email, password, first_name, last_name, age, street, city, postal_code, phone_number):
-     # ...

# GOOD: Group related parameters into a parameter object / record
+ struct UserRegistrationData:
+     email, password, full_name
+     address_info
+     contact_info
+
+ function createUser(user_data: UserRegistrationData):
+     # ...
```

### 5. Feature Envy

```diff
# BAD: Method operating primarily on another object's internal state
- class Order:
-     function calculateDiscount(user):
-         if user.membership_level == "GOLD":
-             return this.total * 0.20
-         if user.account_age_days > 365:
-             return this.total * 0.10
-         return 0

# GOOD: Move logic to the object that owns the data (Move Method)
+ class User:
+     function getEligibleDiscountRate():
+         if this.membership_level == "GOLD": return 0.20
+         if this.account_age_days > 365: return 0.10
+         return 0
+
+ class Order:
+     function calculateDiscount(user):
+         return this.total * user.getEligibleDiscountRate()
```

### 6. Primitive Obsession

```diff
# BAD: Representing domain concepts with raw strings or numbers
- function sendNotification(email_str, phone_str):
-     # Requires manual regex checks scattered everywhere

# GOOD: Encapsulate domain rules in explicit Value Objects
+ class EmailAddress:
+     constructor(value):
+         validate_email_format(value)
+         this.value = value
+
+ class PhoneNumber:
+     constructor(value):
+         validate_phone_format(value)
+         this.value = value
+
+ function sendNotification(to_email: EmailAddress, to_phone: PhoneNumber):
+     # Guarantees valid domain types without inline checks
```

### 7. Magic Numbers / Strings

```diff
# BAD: Inline literal values without semantic explanation
- if user.status == 2:
-     discount = order.total * 0.15
- sleep(86400)

# GOOD: Self-documenting named constants / enums
+ Enum UserStatus: ACTIVE = 1, INACTIVE = 2, SUSPENDED = 3
+ Constant PREMIUM_DISCOUNT_RATE = 0.15
+ Constant ONE_DAY_IN_SECONDS = 86400
+
+ if user.status == UserStatus.INACTIVE:
+     discount = order.total * PREMIUM_DISCOUNT_RATE
+ sleep(ONE_DAY_IN_SECONDS)
```

### 8. Nested Conditionals (Arrow Anti-Pattern)

```diff
# BAD: Deeply nested conditional logic pyramid
- function processPayment(order):
-     if order != null:
-         if order.user != null:
-             if order.user.is_active:
-                 if order.total > 0:
-                     return executePayment(order)
-                 else:
-                     return Error("Invalid total")
-             else:
-                 return Error("User inactive")
-         else:
-             return Error("User missing")
-     else:
-         return Error("Order missing")

# GOOD: Flattened logic using Guard Clauses / Early Returns
+ function processPayment(order):
+     if order == null: return Error("Order missing")
+     if order.user == null: return Error("User missing")
+     if not order.user.is_active: return Error("User inactive")
+     if order.total <= 0: return Error("Invalid total")
+
+     return executePayment(order)
```

### 9. Dead Code

```diff
# BAD: Obsolete functions, unused variables, and dead commented code
- function legacyV1Calculation(x):
-     return x * 1.5
-
- # function oldProcess():
- #     do_something_deprecated()

# GOOD: Clean removal (rely on version control history if ever needed)
+ // Delete dead functions, unreferenced variables, and commented blocks
```

### 10. Inappropriate Intimacy

```diff
# BAD: One object reaching deep into the private internal structure of another (Law of Demeter violation)
- class OrderProcessor:
-     function shipOrder(order):
-         street = order.user.profile.address.shipping.street
-         db.connection.config.timeout.set(30)

# GOOD: Tell, Don't Ask / Encapsulated interactions
+ class OrderProcessor:
+     function shipOrder(order):
+         shipping_address = order.getShippingAddress()
+         order.save()
```

---

## Design Patterns for Refactoring

### Strategy Pattern

```diff
# BAD: Complex switch / conditional branching for behavior variations
- function calculateShippingCost(order, method):
-     if method == "STANDARD":
-         return order.total > 50 ? 0 : 5.99
-     else if method == "EXPRESS":
-         return order.total > 100 ? 9.99 : 14.99
-     else if method == "OVERNIGHT":
-         return 29.99

# GOOD: Encapsulate algorithms into interchangeable Strategy Objects
+ interface ShippingStrategy:
+     function calculate(order)
+
+ class StandardShipping implements ShippingStrategy:
+     function calculate(order): return order.total > 50 ? 0 : 5.99
+
+ class ExpressShipping implements ShippingStrategy:
+     function calculate(order): return order.total > 100 ? 9.99 : 14.99
+
+ class OvernightShipping implements ShippingStrategy:
+     function calculate(order): return 29.99
+
+ function calculateShippingCost(order, strategy: ShippingStrategy):
+     return strategy.calculate(order)
```

---

## Common Refactoring Operations

| Operation | Description | Primary Use Case |
|---|---|---|
| **Extract Method** | Move a block of code into a separate function with a clear name | Break down long methods; eliminate duplication |
| **Extract Class / Module** | Create a new class to hold related fields and methods | Decompose monolithic classes (God Objects) |
| **Introduce Parameter Object** | Group related parameters into a single record/struct | Simplify long parameter lists |
| **Replace Conditional with Guard Clauses** | Use early returns for special cases and error states | Remove deep arrow-style nesting |
| **Replace Conditional with Polymorphism** | Replace `switch`/`if` branching with polymorphic method calls | Handle variant behaviors cleanly |
| **Introduce Value Object** | Wrap primitive data in an immutable object with domain validation | Eliminate primitive obsession |
| **Replace Magic Constant** | Replace literal values with descriptive named constants | Improve readability and maintainability |
| **Inline Method / Class** | Merge simple methods/classes back into callers when abstraction is overkill | Remove unnecessary complexity |
