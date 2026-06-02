const orderService = require('../services/order.service');

async function createOrder(req, res, next) {
  try {
    const result = await orderService.createSaldoOrder(req.app.locals.db, req.user, req.body || {});

    return res.status(result.created ? 201 : 200).json({
      success: true,
      data: result.order
    });
  } catch (error) {
    next(error);
  }
}

async function listOrders(req, res, next) {
  try {
    const orders = await orderService.listOrders(req.app.locals.db, req.user, req.query || {});

    return res.json({
      success: true,
      data: orders
    });
  } catch (error) {
    next(error);
  }
}

async function getOrder(req, res, next) {
  try {
    const order = await orderService.getOrderByInvoice(req.app.locals.db, req.user, req.params.invoice);

    return res.json({
      success: true,
      data: order
    });
  } catch (error) {
    next(error);
  }
}

module.exports = {
  createOrder,
  listOrders,
  getOrder
};
