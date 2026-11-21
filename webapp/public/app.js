const formatNumber = (value) => Number(value || 0).toLocaleString('en-IN');
const formatMoney = (value) => `₹${Number(value || 0).toLocaleString('en-IN', { maximumFractionDigits: 0 })}`;
const statusClass = (status) => status.toLowerCase().replaceAll('_', '-');

async function getJson(path) {
  const response = await fetch(path);
  if (!response.ok) throw new Error('Request failed');
  return response.json();
}

function renderOverview(data) {
  document.querySelector('#orders-count').textContent = formatNumber(data.orders);
  document.querySelector('#delivered-count').textContent = formatNumber(data.delivered);
  document.querySelector('#delivery-time').textContent = data.avg_delivery_minutes || '--';
  document.querySelector('#attention-count').textContent = formatNumber(data.attention);
  document.querySelector('#success-count').textContent = formatNumber(data.successful);
  document.querySelector('#failed-count').textContent = formatNumber(data.failed);
  const total = Number(data.successful || 0) + Number(data.failed || 0);
  const rate = total ? Math.round((Number(data.successful) / total) * 100) : 0;
  document.querySelector('#success-rate').textContent = `${rate}%`;
  document.querySelector('#payment-donut').style.setProperty('--success', `${rate * 3.6}deg`);
}

function renderOrders(rows) {
  const table = document.querySelector('#orders-table');
  table.innerHTML = rows.map((order) => `
    <tr>
      <td><strong class="order-id">#${order.order_id}</strong><span class="muted">${new Date(order.placed_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}</span></td>
      <td>${order.customer_name}</td>
      <td>${order.restaurant_name}</td>
      <td><span class="status ${statusClass(order.status)}">${order.status.replaceAll('_', ' ')}</span></td>
      <td class="align-right amount">${formatMoney(order.total_amount)}</td>
    </tr>`).join('');
}

function renderRestaurants(rows) {
  const list = document.querySelector('#restaurant-list');
  list.innerHTML = rows.map((restaurant, index) => `
    <div class="restaurant-row">
      <span class="rank">0${index + 1}</span>
      <div class="restaurant-avatar">${restaurant.name.slice(0, 1).toUpperCase()}</div>
      <div class="restaurant-info"><strong>${restaurant.name}</strong><span>${restaurant.locality_name}, ${restaurant.city_name}</span></div>
      <div class="restaurant-rating"><span>★</span> ${restaurant.rating ?? '—'}</div>
      <div class="restaurant-orders"><strong>${formatNumber(restaurant.delivered_orders)}</strong><span>delivered</span></div>
      <span class="status ${statusClass(restaurant.status)}">${restaurant.status.replaceAll('_', ' ')}</span>
    </div>`).join('');
}

async function loadDashboard() {
  const [overview, orders, restaurants] = await Promise.all([
    getJson('/api/overview'),
    getJson('/api/orders?limit=8'),
    getJson('/api/restaurants'),
  ]);
  renderOverview(overview);
  renderOrders(orders);
  renderRestaurants(restaurants);
  const now = new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  document.querySelector('#last-sync').textContent = now;
  document.querySelector('#footer-time').textContent = now;
}

document.querySelector('#refresh').addEventListener('click', async (event) => {
  event.currentTarget.classList.add('spinning');
  try { await loadDashboard(); } catch { showError(); }
  event.currentTarget.classList.remove('spinning');
});

document.querySelector('#load-more').addEventListener('click', () => {
  document.querySelector('#orders').scrollIntoView({ behavior: 'smooth' });
});

function showError() {
  document.querySelector('#orders-table').innerHTML = '<tr><td colspan="5" class="error">Dashboard data is unavailable. Check the PostgreSQL connection.</td></tr>';
}

loadDashboard().catch(showError);
