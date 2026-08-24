sap.ui.define([
    "sap/ui/base/Object"
], function (BaseObject) {
    "use strict";

    return BaseObject.extend("ccb.org.aportessegsoc.service.BackendService", {

        // Servicio OData V2 ZHCM_CERTIFICADOS_PERSONAL_WD_SRV, expuesto a través
        // del destination "DestToSAP_QAS" (ruta mapeada en xs-app.json / ui5.yaml)
        _datosBasicosUrl: "/sap/opu/odata/sap/ZHCM_CERTIFICADOS_PERSONAL_WD_SRV/DatosBasicosCertLabSet",

        // Certificados/PDFs de Aportes de Seguridad Social del empleado (filtrado por Pernr)
        _aporteSegSocialUrl: "/sap/opu/odata/sap/ZHCM_CERTIFICADOS_PERSONAL_WD_SRV/AporteSeguridadSocialSet",

        /**
         * Retorna la URL base de la app, respetando el subpath con el que fue
         * desplegada (html5-apps-repo / Work Zone), igual que en ccbcertlaborales.
         * @returns {string} URL base de la app
         * @private
         */
        _getAppBase: function () {
            return sap.ui.require.toUrl("ccb/org/aportessegsoc");
        },

        /**
         * Consulta los datos básicos del empleado por su correo electrónico
         * GET DatosBasicosCertLabSet('<email>')?$format=json
         * @param {string} sEmail - Correo electrónico del empleado (clave del servicio)
         * @returns {Promise} Promise que resuelve con el JSON de respuesta del servicio OData
         */
        GetDataEmployee: function (sEmail) {
            var sId = String(sEmail || "").trim().toUpperCase();
            var sUrl = this._getAppBase() + this._datosBasicosUrl + "('" + sId + "')";

            return this._executeGet(sUrl, { "$format": "json" });
        },

        /**
         * Consulta los certificados/PDFs de aportes de seguridad social del empleado
         * GET AporteSeguridadSocialSet?$filter=Pernr eq '<pernr>'&$format=json
         * @param {string} sPernr - Número de empleado (Pernr)
         * @returns {Promise<Array<{Pernr: string, Gjahr: string, Perio: string, Archivo: string, Documento: string}>>}
         * Promise que resuelve con una colección plana de los aportes; "Documento" trae únicamente
         * el nombre del archivo (sin la ruta de red) extraído de "Archivo"
         */
        getAportesSegSocial: function (sPernr) {
            var that = this;
            var sUrl = this._getAppBase() + this._aporteSegSocialUrl;
            var sFilter = "Pernr eq '" + sPernr + "'";

            return this._executeGet(sUrl, { "$filter": sFilter, "$format": "json" })
                .then(function (oData) {
                    var aResults = (oData && oData.d && oData.d.results) || [];
                    return aResults.map(function (oItem) {
                        return {
                            Pernr: oItem.Pernr,
                            Gjahr: oItem.Gjahr,
                            Perio: oItem.Perio,
                            Archivo: oItem.Archivo,
                            Documento: that._getFileName(oItem.Archivo)
                        };
                    });
                });
        },

        /**
         * Extrae solo el nombre del archivo (sin la ruta de red) de un valor tipo
         * "\\CAMARA_NT\SYS\INTEQAS\2024IR201980.PDF" -> "2024IR201980.PDF"
         * @param {string} sArchivo - Ruta completa del archivo devuelta por el servicio
         * @returns {string} Nombre del archivo
         * @private
         */
        _getFileName: function (sArchivo) {
            var sPath = String(sArchivo || "");
            var aParts = sPath.split(/[\\/]/);
            return aParts[aParts.length - 1] || "";
        },

        /**
         * Ejecuta una petición GET al servicio OData con parámetros en la query string
         * @param {string} sUrl - URL base del servicio
         * @param {object} [oParams] - Parámetros a enviar en la query string (opcional)
         * @returns {Promise} Promise que resuelve con el JSON de respuesta
         * @private
         */
        _executeGet: function (sUrl, oParams) {
            return new Promise(function (resolve, reject) {
                var sQueryString = oParams ? Object.keys(oParams)
                    .map(function (sKey) {
                        return encodeURIComponent(sKey) + "=" + encodeURIComponent(oParams[sKey]);
                    })
                    .join("&") : "";

                var xhr = new XMLHttpRequest();
                xhr.open("GET", sQueryString ? (sUrl + "?" + sQueryString) : sUrl, true);
                xhr.setRequestHeader("Accept", "application/json");

                xhr.onload = function () {
                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            resolve(xhr.responseText ? JSON.parse(xhr.responseText) : {});
                        } catch (e) {
                            resolve({ data: xhr.responseText, rawResponse: true });
                        }
                    } else if (xhr.status === 401) {
                        reject({
                            error: "Authentication failed",
                            status: xhr.status,
                            statusText: xhr.statusText,
                            message: "El token de acceso es inválido o ha expirado"
                        });
                    } else {
                        reject({
                            error: "Service request failed",
                            status: xhr.status,
                            statusText: xhr.statusText,
                            response: xhr.responseText
                        });
                    }
                };

                xhr.onerror = function () {
                    reject({
                        error: "Network error",
                        status: xhr.status,
                        message: "Error de red al conectar con el servicio"
                    });
                };

                xhr.send();
            });
        }
    });
});
