/**
 * Desi Mall - Orders Module Handler
 * Renders My Orders List, Order Details View, Status Timeline & Order Cancellation.
 */

const DesiMallOrdersApp = {
    
    getOrders() {
        return JSON.parse(localStorage.getItem('desimall_orders')) || [];
    },

    saveOrders(orders) {
        localStorage.setItem('desimall_orders', JSON.stringify(orders));
    },

    checkUserSession() {
        const user = typeof DesiMallAuth !== 'undefined' ? DesiMallAuth.getUser() : JSON.parse(localStorage.getItem('desimall_user'));
        const userAuthLink = document.getElementById('userAuthLink');

        if (user && userAuthLink) {
            // DIRECT LINK TO PROFILE PAGE
            userAuthLink.href = 'profile.html';
            userAuthLink.title = 'My Profile';
            userAuthLink.onclick = null;
            userAuthLink.innerHTML = `
                <i class="fa-solid fa-circle-user" style="color:#ff6b00; font-size:20px;"></i>
                <span>${user.Name.split(' ')[0]}</span>
            `;
        }
    },

    paymentExperience(order) {
        const method = String(order.PaymentMethod || order.payment_method || order.PaymentMode || 'cod').toLowerCase();
        const payment = String(order.PaymentStatus || order.payment_status || 'pending').toLowerCase();
        const attempt = String(order.PaymentAttemptStatus || order.payment_attempt_status || '').toLowerCase();
        const refund = String(order.RefundStatus || order.refund_status || 'none').toLowerCase();
        const status = String(order.Status || order.status || '').toLowerCase();
        const refundAmount = Number(order.RefundAmount || order.refund_amount || 0);

        if (method === 'razorpay' && payment !== 'paid' && attempt === 'failed') {
            return {
                label:'Order Not Placed',
                payment:'Payment Failed',
                message:'Payment was not successful. If any amount was deducted, DesiMall will verify it with Razorpay.',
                kind:'failed'
            };
        }

        if (method === 'razorpay' && payment !== 'paid' && !['cancelled','rejected'].includes(status)) {
            return {
                label:'Payment Verification Pending',
                payment:'Pending',
                message:'We are checking the payment with Razorpay. Please do not pay again yet.',
                kind:'pending'
            };
        }

        if (payment === 'paid' && ['cancelled','rejected'].includes(status)) {
            if (['refunded','processed'].includes(refund)) {
                return {
                    label:'Refund Completed',
                    payment:refundAmount > 0 ? `Refunded ₹${refundAmount}` : 'Refund Completed',
                    message:'The cancelled order payment has been refunded.',
                    kind:'refunded'
                };
            }
            return {
                label:'Order Cancelled · Refund Pending',
                payment:'Refund Pending',
                message:'The order is cancelled and the paid amount is being processed for refund.',
                kind:'refund'
            };
        }

        if (method === 'razorpay' && payment === 'paid') {
            return { label:order.Status || 'Placed', payment:'Paid', message:'', kind:'paid' };
        }

        return {
            label:order.Status || 'Pending',
            payment:method === 'cod' ? 'Cash on Delivery' : payment,
            message:'',
            kind:'normal'
        };
    },

    // 1. MY ORDERS PAGE LOGIC
    async initMyOrders() {
        this.checkUserSession();
        CartManager.updateCartBadge();

        let orders = this.getOrders();
        const currentUser = typeof DesiMallAuth !== 'undefined' ? DesiMallAuth.getUser() : JSON.parse(localStorage.getItem('desimall_user'));
        if (currentUser?.UserID && typeof DesiMallAPI !== 'undefined') {
            try {
                const remote = await DesiMallAPI.getMyOrders(currentUser.UserID);
                if (Array.isArray(remote) && remote.length) {
                    const byId = new Map(orders.map(o => [String(o.OrderID), o]));
                    remote.forEach(o => byId.set(String(o.OrderID), { ...byId.get(String(o.OrderID)), ...o }));
                    orders = Array.from(byId.values());
                    this.saveOrders(orders);
                }
            } catch (error) { console.warn('Using offline orders:', error); }
        }
        const container = document.getElementById('ordersContainer');
        const emptyState = document.getElementById('emptyOrdersState');

        if (orders.length === 0) {
            if (container) container.classList.add('hidden');
            if (emptyState) emptyState.classList.remove('hidden');
            return;
        }

        if (container) container.classList.remove('hidden');
        if (emptyState) emptyState.classList.add('hidden');

        // Render Cards (Newest order first)
        container.innerHTML = orders.slice().reverse().map(order => {
            const statusClass = (order.Status || 'Pending').toLowerCase().replace(/\s+/g, '-');
            const totalQty = (order.Items || []).reduce((sum, i) => sum + (i.Qty || 1), 0);

            return `
                <div class="order-card">
                    <div class="order-card-header">
                        <div class="order-meta">
                            <div>Order ID: <strong>${order.OrderID}</strong></div>
                            <div>Date: <strong>${order.OrderDate}</strong></div>
                            <div>Total: <strong>₹${order.TotalAmount}</strong> (${totalQty} Items)</div>
                        </div>
                        <span class="status-badge ${statusClass}">
                            <i class="fa-solid fa-circle-dot"></i> ${order.Status || 'Pending'}
                        </span>
                    </div>

                    <div class="order-card-body">
                        ${(order.Items || []).map(item => `
                            <div class="order-item-row">
                                <img src="../${item.ImageURL}" class="order-item-img" alt="${item.ProductName}" onerror="this.src='../assets/products/noimage.jpg'">
                                <div class="order-item-info">
                                    <div class="order-item-title">${item.ProductName}</div>
                                    <div class="order-item-sub">Quantity: ${item.Qty || 1} | Seller: ${item.Seller || 'RRT Apparel'}</div>
                                </div>
                                <div class="order-item-price">₹${(item.FinalPrice || item.Price) * (item.Qty || 1)}</div>
                            </div>
                        `).join('')}
                    </div>

                    <div class="order-card-footer">
                        ${(order.Status === 'Pending' || !order.Status) ? `
                            <button type="button" class="btn-order-action btn-danger-outline" onclick="DesiMallOrdersApp.cancelOrder('${order.OrderID}')">
                                <i class="fa-regular fa-circle-xmark"></i> Cancel Order
                            </button>
                        ` : ''}
                        <a href="order-details.html?id=${order.OrderID}" class="btn-order-action btn-outline">
                            <i class="fa-solid fa-eye"></i> View Details & Track
                        </a>
                    </div>
                </div>
            `;
        }).join('');
    },

    // 2. ORDER DETAILS PAGE LOGIC
    async initOrderDetails() {
        this.checkUserSession();
        CartManager.updateCartBadge();

        const urlParams = new URLSearchParams(window.location.search);
        const orderId = urlParams.get('id');

        if (!orderId) {
            alert('Order ID missing!');
            window.location.href = 'my-orders.html';
            return;
        }

        let orders = this.getOrders();
        const currentUser = typeof DesiMallAuth !== 'undefined' ? DesiMallAuth.getUser() : JSON.parse(localStorage.getItem('desimall_user'));
        if (currentUser?.UserID && typeof DesiMallAPI !== 'undefined') {
            try {
                const remote = await DesiMallAPI.getMyOrders(currentUser.UserID);
                if (Array.isArray(remote) && remote.length) {
                    const byId = new Map(orders.map(o => [String(o.OrderID), o]));
                    remote.forEach(o => byId.set(String(o.OrderID), { ...byId.get(String(o.OrderID)), ...o }));
                    orders = Array.from(byId.values());
                    this.saveOrders(orders);
                }
            } catch (error) { console.warn('Using offline orders:', error); }
        }
        const order = orders.find(o => String(o.OrderID) === String(orderId));

        if (!order) {
            alert('Order not found!');
            window.location.href = 'my-orders.html';
            return;
        }

        // Render Details Header
        document.getElementById('breadcrumbOrderId').textContent = `Order ${order.OrderID}`;
        document.getElementById('displayDetailsOrderId').textContent = order.OrderID;
        document.getElementById('displayDetailsOrderDate').textContent = order.OrderDate;

        const paymentUx = this.paymentExperience(order);
        const statusClass = String(paymentUx.label || 'Pending').toLowerCase().replace(/[^a-z0-9]+/g, '-');
        document.getElementById('displayDetailsStatusBadge').innerHTML = `
            <span class="status-badge ${statusClass}">
                <i class="fa-solid fa-circle-dot"></i> ${paymentUx.label}
            </span>
        `;

        const timeline = document.getElementById('timelineContainer');
        if (timeline && ['failed','pending','refund','refunded'].includes(paymentUx.kind)) {
            const icon = paymentUx.kind === 'refunded'
                ? 'fa-circle-check'
                : paymentUx.kind === 'pending'
                    ? 'fa-clock-rotate-left'
                    : 'fa-circle-exclamation';
            timeline.innerHTML = `
                <div style="width:100%;padding:18px;border-radius:12px;background:#fff7ed;border:1px solid #fed7aa;text-align:left;">
                    <div style="font-size:18px;font-weight:800;margin-bottom:6px;">
                        <i class="fa-solid ${icon}" style="color:#ff6500;margin-right:7px;"></i>
                        ${paymentUx.label}
                    </div>
                    <div style="color:#6b7280;line-height:1.5;">${paymentUx.message}</div>
                </div>
            `;
        } else {
            this.updateTimeline(order.Status || 'Pending');
        }

        // Render Products
        const productsList = document.getElementById('detailsProductsList');
        if (productsList) {
            productsList.innerHTML = (order.Items || []).map(item => `
                <div class="order-item-row" style="padding: 10px 0; border-bottom: 1px solid #f0f0f0;">
                    <img src="../${item.ImageURL}" class="order-item-img" alt="${item.ProductName}" onerror="this.src='../assets/products/noimage.jpg'">
                    <div class="order-item-info">
                        <div class="order-item-title">${item.ProductName}</div>
                        <div class="order-item-sub">Qty: ${item.Qty || 1} | Price: ₹${item.FinalPrice || item.Price}</div>
                    </div>
                    <div class="order-item-price">₹${(item.FinalPrice || item.Price) * (item.Qty || 1)}</div>
                </div>
            `).join('');
        }

        // Render Address
        const addr = order.DeliveryAddress || {};
        const addressBox = document.getElementById('detailsAddressBox');
        if (addressBox) {
            addressBox.innerHTML = `
                <strong>${addr.FullName || 'Customer'}</strong><br>
                ${addr.Address || ''}<br>
                ${addr.City || ''}, ${addr.State || ''} - ${addr.Pincode || ''}<br>
                ${addr.Landmark ? `Landmark: ${addr.Landmark}<br>` : ''}
                Phone Number: <strong>+91 ${addr.Mobile || ''}</strong>
            `;
        }

        // Render Payment & Total
        document.getElementById('detailsPaymentMethod').textContent =
            `${String(order.PaymentMethod || order.PaymentMode || 'COD').toUpperCase()} · ${this.paymentExperience(order).payment}`;
        document.getElementById('detailsGrandTotal').textContent = `₹${order.TotalAmount}`;

        // Render Actions (Cancel if Pending)
        const actionsBox = document.getElementById('detailsActionsBox');
        if (actionsBox) {
            const ux = this.paymentExperience(order);

            if (ux.kind === 'failed') {
                actionsBox.innerHTML = `
                    <a href="../index.html" class="btn-order-action btn-outline" style="width:100%;justify-content:center;height:42px;">
                        <i class="fa-solid fa-rotate-right"></i> Buy Again
                    </a>
                    <a href="support.html" class="btn-order-action btn-outline" style="width:100%;justify-content:center;height:42px;">
                        <i class="fa-solid fa-headset"></i> Payment Help
                    </a>
                `;
            } else if (ux.kind === 'pending') {
                actionsBox.innerHTML = `
                    <a href="my-orders.html" class="btn-order-action btn-outline" style="width:100%;justify-content:center;height:42px;">
                        <i class="fa-solid fa-arrows-rotate"></i> Check Payment Status
                    </a>
                `;
            } else {
                const invoiceButton = `<a href="invoice.html?id=${encodeURIComponent(order.OrderID)}" class="btn-order-action btn-outline" style="width:100%;justify-content:center;height:42px;"><i class="fa-solid fa-file-invoice"></i> View / Print Invoice</a>`;
                const cancelButton = (order.Status === 'Pending' || !order.Status) ? `<button type="button" class="btn-order-action btn-danger-outline" style="width:100%;justify-content:center;height:42px;" onclick="DesiMallOrdersApp.cancelOrder('${order.OrderID}')"><i class="fa-regular fa-circle-xmark"></i> Cancel This Order</button>` : '';
                actionsBox.innerHTML = invoiceButton + cancelButton;
            }
        }
    },

    updateTimeline(status) {
        const statuses = ['Pending','Accepted','Preparing','Ready for Pickup','Pickup Assigned','Picked Up','On the Way','Reached Customer','Delivered'];
        const currentIndex = statuses.indexOf(status);

        if (status === 'Cancelled') {
            document.getElementById('timelineContainer').innerHTML = `
                <div style="text-align:center; color:#dc2626; font-weight:700; width:100%; padding:10px;">
                    <i class="fa-solid fa-circle-xmark" style="font-size:24px;"></i><br>This Order Has Been Cancelled.
                </div>
            `;
            return;
        }

        const steps = ['stepPending', 'stepConfirmed', 'stepPacked', 'stepShipped', 'stepDelivered'];
        const lines = ['line1', 'line2', 'line3', 'line4'];

        steps.forEach((stepId, idx) => {
            const el = document.getElementById(stepId);
            if (el) {
                if (idx <= currentIndex || (currentIndex === -1 && idx === 0)) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            }
        });

        lines.forEach((lineId, idx) => {
            const el = document.getElementById(lineId);
            if (el) {
                if (idx < currentIndex) {
                    el.classList.add('active');
                } else {
                    el.classList.remove('active');
                }
            }
        });
    },

    async cancelOrder(orderId) {
        if (!confirm(`Are you sure you want to cancel Order ID: ${orderId}?`)) return;

        let orders = this.getOrders();
        const currentUser = typeof DesiMallAuth !== 'undefined' ? DesiMallAuth.getUser() : JSON.parse(localStorage.getItem('desimall_user'));
        if (currentUser?.UserID && typeof DesiMallAPI !== 'undefined') {
            try {
                const remote = await DesiMallAPI.getMyOrders(currentUser.UserID);
                if (Array.isArray(remote) && remote.length) {
                    const byId = new Map(orders.map(o => [String(o.OrderID), o]));
                    remote.forEach(o => byId.set(String(o.OrderID), { ...byId.get(String(o.OrderID)), ...o }));
                    orders = Array.from(byId.values());
                    this.saveOrders(orders);
                }
            } catch (error) { console.warn('Using offline orders:', error); }
        }
        const order = orders.find(o => String(o.OrderID) === String(orderId));

        if (order) {
            const user = typeof DesiMallAuth !== 'undefined' ? DesiMallAuth.getUser() : JSON.parse(localStorage.getItem('desimall_user'));
            if (typeof DesiMallAPI !== 'undefined' && DesiMallAPI.cancelOrder) {
                try {
                    const result = await DesiMallAPI.cancelOrder(orderId, user?.UserID || '');
                    if (result && result.success === false && !result.offline) throw new Error(result.message || 'Cancellation failed');
                } catch (error) { console.warn('Server cancellation unavailable; saved locally.', error); }
            }
            order.Status = 'Cancelled';
            order.CancelledAt = new Date().toISOString();
            this.saveOrders(orders);
            alert(`Order ${orderId} has been cancelled successfully.`);
            window.location.reload();
        }
    }
};