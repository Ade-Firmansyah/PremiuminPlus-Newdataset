export const orderQueue = {
  async add(name, payload) {
    return {
      id: `${name}-${Date.now()}`,
      name,
      payload,
    };
  },
};
