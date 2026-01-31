// const systemPrompt = `email platform url: runever://benchmark/#/email
// ordering platform url: runever://benchmark/#/pos`;

export namespace runEverMark {
  export const search = {
    basicUrl: '#/search/basic',
    basic: `in search engine, search iphone 17 pro max and click the result from amazon`,
    basicHook: () => {
      const results = JSON.parse(localStorage.getItem('runEverMark_benchmark_results') || '{}');
      const task = results['#/search/basic'];
      return task?.['focus_input'] === true &&
             task?.['input_query'] === true &&
             task?.['submit_query'] === true &&
             task?.['click_result'] === true;
    },
    proUrl: '#/search/pro',
    pro: `in search engine, wanna buy a iphone 17 pro max, search and click a suitable result foy buying`,
    proHook: () => {
      const results = JSON.parse(localStorage.getItem('runEverMark_benchmark_results') || '{}');
      const task = results['#/search/pro'];
      return task?.['focus_input'] === true &&
             task?.['input_query'] === true &&
             task?.['submit_query'] === true &&
             task?.['click_result'] === true;
    }
  };
  export const ecommerce = {
    basicUrl: '#/ecomm/basic',
    basic: `in ecommerce platform, search Home Item 31, add to cart and checkout. pay with following detail:
full name: Pika Chu
address: 1600 Pennsylvania Ave NW, Washington, DC 20500, United States
card number: 1234 4321 1234 4321
cvv: 999
expiry: 01/30
then place order.`,
    basicHook: () => {
      const results = JSON.parse(localStorage.getItem('runEverMark_benchmark_results') || '{}');
      const task = results['#/ecomm/basic'];
      return task?.['click_target_product'] === true &&
             task?.['field_name'] === true &&
             task?.['field_address'] === true &&
             task?.['field_card'] === true &&
             task?.['field_cvv'] === true &&
             task?.['field_expiry'] === true &&
             task?.['submit_order'] === true;
    },
    proUrl: '#/ecomm/pro',
    pro: `in ecommerce platform, filter tech product which price < 80 then add the best reviewed one to cart and go to checkout. pay with payment gateway.
    login gateway with following:
email: pikachu@pokemon.com
password: P@ssword321
if asked for 2FA go to email platform in new tab, login with above username password get the security code and switch back to login. pick the best price credit card then place order.`,
    proHook: () => {
      const results = JSON.parse(localStorage.getItem('runEverMark_benchmark_results') || '{}');
      const p = '#/ecomm/pro';
      const steps = {
        filter: results[p]?.['filter_price'],
        click: results[p]?.['click_target_product'],
        checkout_gatepal: results[p]?.['select_gatepal'],
        gateway_login_email: results[p]?.['gateway_login_email'],
        gateway_login_password: results[p]?.['gateway_login_password'],
        email_login: results[p]?.['email_login'],
        email_open_2fa: results[p]?.['email_open_2fa'],
        focus_2fa: results[p]?.['focus_2fa'],
        check_code: results[p]?.['check_email_code'],
        pick_card: results[p]?.['pick_best_card'],
        submit_order: results[p]?.['submit_gateway_order']
      };
      const success = Object.values(steps).every(Boolean);
      return { success, details: steps };
    }
  };
  export const pos = {
    basicUrl: '#/pos/basic',
    basic: `login to email account with:
email: pikachu@pokemon.com
password: P@ssword321
get the new order email, read the detail. then go to pos system, create order with the the detail on email.`,
    basicHook: () => {
      const results = JSON.parse(localStorage.getItem('runEverMark_benchmark_results') || '{}');
      const task = results['#/pos/basic'];
      return task?.['email_login'] === true &&
             task?.['pos_login'] === true &&
             task?.['click_create_order'] === true &&
             task?.['input_client'] === true &&
             task?.['input_phone'] === true &&
             task?.['input_address'] === true &&
             task?.['input_product'] === true &&
             task?.['input_delivery_date'] === true &&
             task?.['submit_order'] === true;
    },
    proUrl: '#/pos/pro',
    pro: `login to email account with:
email: pikachu@pokemon.com
password: P@ssword321
get the new order email, download the attached order form pdf. then go to pos system, create order with detail from the the order form.
in preview, if order amount > 1000, cap screenshot & go to messager, send him order detail & screenshot seek for manager dillion's approve and do what he advise in case
after submit go to order list and download the invoice. go to email and reply the client`,
    proHook: () => {
      const results = JSON.parse(localStorage.getItem('runEverMark_benchmark_results') || '{}');
      const task = results['#/pos/pro'];
      return task?.['email_login'] === true &&
             task?.['click_email_attachment'] === true &&
             task?.['pos_login'] === true &&
             task?.['click_create_order'] === true &&
             task?.['input_lines'] === true &&
             task?.['input_client'] === true &&
             task?.['input_phone'] === true &&
             task?.['input_address'] === true &&
             task?.['input_delivery_date'] === true &&
             task?.['submit_order'] === true &&
             task?.['click_download_invoice'] === true &&
             task?.['click_reply'] === true &&
             task?.['upload_reply_attachment'] === true;
    }
  }
}
