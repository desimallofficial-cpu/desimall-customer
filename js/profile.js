/**
 * Desi Mall - Profile & Address Book Manager
 * Customer Address Book uses Render + Supabase API v0.5.0.
 */

const DesiMallProfileApp = {
    addresses: [],
    addressBusy: false,

    getUser() {
        return typeof DesiMallAuth !== 'undefined'
            ? DesiMallAuth.getUser()
            : JSON.parse(localStorage.getItem('desimall_user'));
    },

    saveUser(user) {
        if (typeof DesiMallAuth !== 'undefined') {
            DesiMallAuth.setUser(user);
        } else {
            localStorage.setItem('desimall_user', JSON.stringify(user));
        }
    },

    checkAuth() {
        const user = this.getUser();

        if (!user) {
            alert('Please login to access this page.');
            window.location.href = 'login.html';
            return null;
        }

        const briefName = document.getElementById('briefUserName');
        if (briefName) briefName.textContent = user.Name || 'User';

        if (user.Avatar) {
            const avatars = [
                document.getElementById('briefAvatar'),
                document.getElementById('avatarPreview')
            ];

            avatars.forEach(av => {
                if (av) {
                    av.innerHTML = `<img src="${this.escapeHtml(user.Avatar)}" alt="${this.escapeHtml(user.Name || 'User')}">`;
                }
            });
        }

        const btnLogout = document.getElementById('btnLogoutSidebar');
        if (btnLogout) {
            btnLogout.onclick = () => {
                if (confirm('Are you sure you want to logout?')) {
                    if (typeof DesiMallAuth !== 'undefined') {
                        DesiMallAuth.logout('../index.html');
                    } else {
                        localStorage.removeItem('desimall_user');
                        window.location.href = '../index.html';
                    }
                }
            };
        }

        if (typeof DesiMallAuth !== 'undefined') {
            DesiMallAuth.updateHeader?.();
        }

        return user;
    },

    // =========================================================
    // PROFILE PAGE
    // =========================================================

    initProfilePage() {
        const user = this.checkAuth();
        if (!user) return;

        CartManager.updateCartBadge();

        const nameInput = document.getElementById('profileName');
        const mobileInput = document.getElementById('profileMobile');
        const emailInput = document.getElementById('profileEmail');

        if (nameInput) nameInput.value = user.Name || '';
        if (mobileInput) mobileInput.value = user.Mobile || '';
        if (emailInput) emailInput.value = user.Email || '';

        const btnEdit = document.getElementById('btnEditProfile');
        const btnCancel = document.getElementById('btnCancelEdit');
        const formActions = document.getElementById('profileFormActions');
        const avatarControls = document.getElementById('avatarControls');

        if (btnEdit) {
            btnEdit.onclick = () => {
                if (nameInput) nameInput.disabled = false;
                if (mobileInput) mobileInput.disabled = false;
                if (emailInput) emailInput.disabled = false;
                formActions?.classList.remove('hidden');
                avatarControls?.classList.remove('hidden');
                btnEdit.classList.add('hidden');
            };
        }

        if (btnCancel) {
            btnCancel.onclick = () => {
                if (nameInput) {
                    nameInput.value = user.Name || '';
                    nameInput.disabled = true;
                }
                if (mobileInput) {
                    mobileInput.value = user.Mobile || '';
                    mobileInput.disabled = true;
                }
                if (emailInput) {
                    emailInput.value = user.Email || '';
                    emailInput.disabled = true;
                }

                formActions?.classList.add('hidden');
                avatarControls?.classList.add('hidden');
                btnEdit?.classList.remove('hidden');
            };
        }

        const avatarInput = document.getElementById('avatarInput');
        if (avatarInput) {
            avatarInput.onchange = event => {
                const file = event.target.files?.[0];
                if (!file) return;

                const reader = new FileReader();
                reader.onload = result => {
                    const imgData = result.target?.result || '';
                    user.Avatar = imgData;

                    const preview = document.getElementById('avatarPreview');
                    if (preview) preview.innerHTML = `<img src="${imgData}" alt="Profile photo">`;
                };
                reader.readAsDataURL(file);
            };
        }

        const profileForm = document.getElementById('profileForm');
        if (profileForm) {
            profileForm.onsubmit = event => {
                event.preventDefault();

                user.Name = nameInput?.value.trim() || user.Name;
                user.Mobile = mobileInput?.value.trim() || user.Mobile;
                user.Email = emailInput?.value.trim() || user.Email;

                this.saveUser(user);

                if (typeof DesiMallAPI !== 'undefined' && DesiMallAPI.updateProfile) {
                    DesiMallAPI.updateProfile(user).catch(console.warn);
                }

                this.showAlert(
                    'Profile updated successfully!',
                    'success',
                    'profileAlert'
                );

                btnCancel?.click();
            };
        }

        const passwordForm = document.getElementById('passwordForm');
        if (passwordForm) {
            passwordForm.onsubmit = event => {
                event.preventDefault();

                this.showAlert(
                    'Password updated successfully!',
                    'success',
                    'profileAlert'
                );

                passwordForm.reset();
            };
        }
    },

    // =========================================================
    // ADDRESS BOOK — SUPABASE SOURCE OF TRUTH
    // =========================================================

    async initAddressBookPage() {
        const user = this.checkAuth();
        if (!user) return;

        CartManager.updateCartBadge();

        const form = document.getElementById('addressForm');
        const btnCancelEdit = document.getElementById('btnCancelAddressEdit');

        if (btnCancelEdit && form) {
            btnCancelEdit.onclick = () => this.resetAddressForm();
        }

        if (form) {
            form.onsubmit = async event => {
                event.preventDefault();
                await this.submitAddressForm();
            };
        }

        await this.loadAddresses();
    },

    async loadAddresses() {
        const grid = document.getElementById('addressGrid');

        if (grid) {
            grid.innerHTML = `
                <div class="address-loading">
                    <i class="fa-solid fa-spinner fa-spin"></i>
                    Loading saved addresses...
                </div>
            `;
        }

        try {
            if (typeof DesiMallAPI === 'undefined') {
                throw new Error('Address service is not loaded.');
            }

            this.addresses = await DesiMallAPI.getAddresses();
            this.renderAddresses();
        } catch (error) {
            console.error('Address load failed:', error);
            this.addresses = [];

            if (grid) {
                grid.innerHTML = `
                    <div class="address-empty-state">
                        <i class="fa-solid fa-triangle-exclamation"></i>
                        <strong>Could not load saved addresses</strong>
                        <span>${this.escapeHtml(error.message || 'Please try again.')}</span>
                        <button type="button" class="btn-addr-action" onclick="DesiMallProfileApp.loadAddresses()">
                            Try Again
                        </button>
                    </div>
                `;
            }

            if (error?.status === 401 || error?.code === 'AUTH_REQUIRED' || error?.code === 'INVALID_SESSION') {
                this.showAlert(
                    'Your login session has expired. Please login again.',
                    'error',
                    'addressAlert'
                );
            }
        }
    },

    async submitAddressForm() {
        if (this.addressBusy) return;

        const addressId = document.getElementById('addressId')?.value.trim() || '';
        const fullName = document.getElementById('addrFullName')?.value.trim() || '';
        const mobile = (document.getElementById('addrMobile')?.value || '')
            .replace(/\D/g, '')
            .slice(-10);
        const pincode = (document.getElementById('addrPincode')?.value || '')
            .replace(/\D/g, '')
            .slice(0, 6);
        const city = document.getElementById('addrCity')?.value.trim() || '';
        const state = document.getElementById('addrState')?.value.trim() || '';
        const line1 = document.getElementById('addrFullText')?.value.trim() || '';
        const line2 = document.getElementById('addrLandmark')?.value.trim() || '';
        const isDefault = Boolean(document.getElementById('addrIsDefault')?.checked);

        if (!fullName) {
            return this.showAlert('Please enter recipient name.', 'error', 'addressAlert');
        }

        if (!/^[6-9]\d{9}$/.test(mobile)) {
            return this.showAlert('Please enter a valid 10-digit mobile number.', 'error', 'addressAlert');
        }

        if (!/^\d{6}$/.test(pincode)) {
            return this.showAlert('Please enter a valid 6-digit pincode.', 'error', 'addressAlert');
        }

        if (!city || !state || !line1) {
            return this.showAlert(
                'City, State and Full Address are required.',
                'error',
                'addressAlert'
            );
        }

        const payload = {
            AddressID: addressId,
            Label: 'Home',
            FullName: fullName,
            Mobile: mobile,
            Pincode: pincode,
            City: city,
            District: city,
            State: state,
            AddressLine1: line1,
            AddressLine2: line2,
            IsDefault: isDefault
        };

        const button = document.getElementById('btnSaveAddress');
        this.setAddressBusy(true, button);

        try {
            const result = await DesiMallAPI.saveAddress(payload);

            this.showAlert(
                result?.duplicate
                    ? 'This address is already saved.'
                    : addressId
                        ? 'Address updated successfully!'
                        : 'Address saved successfully!',
                'success',
                'addressAlert'
            );

            this.resetAddressForm();
            await this.loadAddresses();
            await this.syncDefaultAddressToLocalUser();
        } catch (error) {
            console.error('Address save failed:', error);

            this.showAlert(
                error.message || 'Could not save address.',
                'error',
                'addressAlert'
            );
        } finally {
            this.setAddressBusy(false, button);
        }
    },

    renderAddresses() {
        const grid = document.getElementById('addressGrid');
        if (!grid) return;

        const addresses = Array.isArray(this.addresses)
            ? this.addresses
            : [];

        if (!addresses.length) {
            grid.innerHTML = `
                <div class="address-empty-state">
                    <i class="fa-solid fa-location-dot"></i>
                    <strong>No saved addresses yet</strong>
                    <span>Add your first delivery address using the form above.</span>
                </div>
            `;
            return;
        }

        grid.innerHTML = addresses.map(addr => {
            const id = this.escapeHtml(addr.AddressID || addr.id || '');
            const fullName = this.escapeHtml(addr.FullName || addr.recipient_name || '');
            const line1 = this.escapeHtml(addr.AddressLine1 || addr.Address || addr.line1 || '');
            const line2 = this.escapeHtml(addr.AddressLine2 || addr.line2 || '');
            const city = this.escapeHtml(addr.City || addr.city || '');
            const district = this.escapeHtml(addr.District || addr.district || '');
            const state = this.escapeHtml(addr.State || addr.state || '');
            const pincode = this.escapeHtml(addr.Pincode || addr.pincode || '');
            const mobile = this.escapeHtml(addr.Mobile || addr.mobile || '');
            const isDefault = Boolean(addr.IsDefault ?? addr.is_default);

            const locality = [
                city,
                district && district !== city ? district : '',
                state
            ].filter(Boolean).join(', ');

            return `
                <article class="address-item-card ${isDefault ? 'default-addr' : ''}">
                    <div class="address-card-top">
                        <div>
                            ${isDefault ? '<span class="default-badge"><i class="fa-solid fa-circle-check"></i> DEFAULT</span>' : ''}
                            <strong class="address-recipient">${fullName}</strong>
                        </div>

                        <span class="address-label">
                            <i class="fa-solid fa-house"></i>
                            ${this.escapeHtml(addr.Label || addr.label || 'Home')}
                        </span>
                    </div>

                    <div class="address-details">
                        <p>${line1}</p>
                        ${line2 ? `<p>${line2}</p>` : ''}
                        <p>${locality}${pincode ? ` - ${pincode}` : ''}</p>
                        <p><i class="fa-solid fa-phone"></i> +91 ${mobile}</p>
                    </div>

                    <div class="address-actions">
                        <button type="button" class="btn-addr-action" onclick="DesiMallProfileApp.editAddress('${id}')">
                            <i class="fa-solid fa-pen"></i>
                            Edit
                        </button>

                        ${!isDefault ? `
                            <button type="button" class="btn-addr-action" onclick="DesiMallProfileApp.setDefaultAddress('${id}')">
                                <i class="fa-solid fa-check"></i>
                                Set Default
                            </button>
                        ` : ''}

                        <button type="button" class="btn-addr-action delete" onclick="DesiMallProfileApp.deleteAddress('${id}')">
                            <i class="fa-solid fa-trash"></i>
                            Delete
                        </button>
                    </div>
                </article>
            `;
        }).join('');
    },

    editAddress(addrId) {
        const addr = this.addresses.find(
            item => String(item.AddressID || item.id) === String(addrId)
        );

        if (!addr) return;

        const setValue = (id, value) => {
            const el = document.getElementById(id);
            if (el) el.value = value ?? '';
        };

        setValue('addressId', addr.AddressID || addr.id);
        setValue('addrFullName', addr.FullName || addr.recipient_name);
        setValue('addrMobile', addr.Mobile || addr.mobile);
        setValue('addrPincode', addr.Pincode || addr.pincode);
        setValue('addrCity', addr.City || addr.city || addr.District || addr.district);
        setValue('addrState', addr.State || addr.state);
        setValue('addrFullText', addr.AddressLine1 || addr.Address || addr.line1);
        setValue('addrLandmark', addr.AddressLine2 || addr.line2);

        const defaultBox = document.getElementById('addrIsDefault');
        if (defaultBox) defaultBox.checked = Boolean(addr.IsDefault ?? addr.is_default);

        const title = document.getElementById('formAddressTitle');
        if (title) {
            title.innerHTML = '<i class="fa-solid fa-location-dot text-orange"></i> Edit Address';
        }

        document.getElementById('btnCancelAddressEdit')?.classList.remove('hidden');
        document.getElementById('addrFullName')?.focus();
        window.scrollTo({ top: 0, behavior: 'smooth' });
    },

    async deleteAddress(addrId) {
        if (this.addressBusy) return;

        const addr = this.addresses.find(
            item => String(item.AddressID || item.id) === String(addrId)
        );

        if (!addr) return;

        if (!confirm('Are you sure you want to delete this address?')) return;

        this.addressBusy = true;

        try {
            await DesiMallAPI.deleteAddress(addrId);

            this.showAlert(
                'Address deleted successfully.',
                'success',
                'addressAlert'
            );

            await this.loadAddresses();
            await this.syncDefaultAddressToLocalUser();
        } catch (error) {
            console.error('Address delete failed:', error);

            this.showAlert(
                error.message || 'Could not delete address.',
                'error',
                'addressAlert'
            );
        } finally {
            this.addressBusy = false;
        }
    },

    async setDefaultAddress(addrId) {
        if (this.addressBusy) return;

        this.addressBusy = true;

        try {
            await DesiMallAPI.setDefaultAddress(addrId);

            this.showAlert(
                'Default delivery address updated.',
                'success',
                'addressAlert'
            );

            await this.loadAddresses();
            await this.syncDefaultAddressToLocalUser();
        } catch (error) {
            console.error('Set default address failed:', error);

            this.showAlert(
                error.message || 'Could not update default address.',
                'error',
                'addressAlert'
            );
        } finally {
            this.addressBusy = false;
        }
    },

    resetAddressForm() {
        const form = document.getElementById('addressForm');
        if (form) form.reset();

        const addressId = document.getElementById('addressId');
        if (addressId) addressId.value = '';

        const title = document.getElementById('formAddressTitle');
        if (title) {
            title.innerHTML = '<i class="fa-solid fa-location-dot text-orange"></i> Add New Address';
        }

        document.getElementById('btnCancelAddressEdit')?.classList.add('hidden');
    },

    async syncDefaultAddressToLocalUser() {
        const defaultAddress = this.addresses.find(
            item => Boolean(item.IsDefault ?? item.is_default)
        ) || null;

        const user = this.getUser();
        if (!user) return;

        user.DefaultAddress = defaultAddress;
        user.Address = defaultAddress
            ? [
                defaultAddress.AddressLine1 || defaultAddress.Address || defaultAddress.line1 || '',
                defaultAddress.City || defaultAddress.city || '',
                defaultAddress.State || defaultAddress.state || '',
                defaultAddress.Pincode || defaultAddress.pincode || ''
            ].filter(Boolean).join(', ')
            : '';

        this.saveUser(user);
    },

    setAddressBusy(busy, button) {
        this.addressBusy = busy;

        if (!button) return;

        if (!button.dataset.originalHtml) {
            button.dataset.originalHtml = button.innerHTML;
        }

        button.disabled = busy;
        button.innerHTML = busy
            ? '<i class="fa-solid fa-spinner fa-spin"></i> Saving...'
            : button.dataset.originalHtml;
    },

    showAlert(msg, type, containerId) {
        const box = document.getElementById(containerId);

        if (box) {
            box.textContent = msg;
            box.className = `profile-alert ${type}`;
            box.classList.remove('hidden');

            setTimeout(
                () => box.classList.add('hidden'),
                3500
            );
        }
    },

    escapeHtml(value) {
        return String(value ?? '').replace(
            /[&<>'"]/g,
            ch => ({
                '&': '&amp;',
                '<': '&lt;',
                '>': '&gt;',
                "'": '&#39;',
                '"': '&quot;'
            }[ch])
        );
    }
};
