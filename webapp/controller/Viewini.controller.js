sap.ui.define([
    "sap/ui/core/mvc/Controller"
], (Controller) => {
    "use strict";

    return Controller.extend("ccb.org.aportessegsoc.controller.Viewini", {
        onInit() {

            // Datos del empleado logueado (correo) desde el modelo global
            var oGlobalDataModel = this.getOwnerComponent().getModel("globalData");
        },

        /**
         * Manejador del click sobre el hipervínculo de la columna "Documento" de la tabla
         * de Aportes de Seguridad Social. Por ahora solo obtiene el registro seleccionado;
         * la lógica para construir la URL del PDF y mostrarlo se implementará más adelante.
         * @param {sap.ui.base.Event} oEvent - Evento press del control Link
         */
        onVerDocumento(oEvent) {
            var oLink = oEvent.getSource();
            var oContext = oLink.getBindingContext("globalData");
            var oAporte = oContext && oContext.getObject();

            // TODO: construir la URL del documento PDF (Pernr, Gjahr, Perio, Archivo) y mostrarlo
            console.log("Ver documento de aporte de seguridad social:", oAporte);
        }
    });
});
