export function callSelectWarehouse() {
  return {
    callback: () => {
      window.location.href = "/pda/warehouse/select";
      return false;
    },
  };
}
