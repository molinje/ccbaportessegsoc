sap.ui.define([
    "sap/ui/core/UIComponent",
    "ccb/org/aportessegsoc/model/models",
    "ccb/org/aportessegsoc/service/BackendService",
    "sap/ui/model/json/JSONModel"
], (UIComponent, models, BackendService, JSONModel) => {
    "use strict";

    return UIComponent.extend("ccb.org.aportessegsoc.Component", {
        metadata: {
            manifest: "json",
            interfaces: [
                "sap.ui.core.IAsyncContentCreation"
            ]
        },

        init() {
            // call the base component's init function
            UIComponent.prototype.init.apply(this, arguments);

            // set the device model
            this.setModel(models.createDeviceModel(), "device");

            // enable routing
            this.getRouter().initialize();

            // Crear modelo global para datos del servicio (se rellena cuando se resuelve el usuario logueado)
            var oGlobalDataModel = new JSONModel({
                userLogin: { id: "", email: "", fullName: "" }, // Datos del usuario actual
                userData: null,            // Respuesta del servicio DatosBasicosCertLabSet
                aportesSegSocial: []       // Certificados/PDFs de Aportes de Seguridad Social (AporteSeguridadSocialSet)
            });
            this.setModel(oGlobalDataModel, "globalData");

            var oBackendService = new BackendService();

            // Obtener datos del usuario logueado (Work Zone o, si no hay Work Zone, App Router directo vía IAS)
            this._getLoggedUserData()
                .then(function (oUserData) {
                    console.log("Datos del usuario logueado:", oUserData);
                    oGlobalDataModel.setProperty("/userLogin", oUserData);

                    // Cargar los datos básicos del empleado logueado
                    return oBackendService.GetDataEmployee(oUserData.email)
                        .then(function (oData) {
                            var oEmployeeData = (oData && oData.d) || oData;
                            //oGlobalDataModel.setProperty("/userData", oEmployeeData);
                            oGlobalDataModel.setProperty("/userData", oData);
                            if (!oData || !oData.d) {
                                console.error("Datos del empleado no disponibles");
                                return;
                            }

                            // Cargar una única vez el listado de aportes de seguridad social del empleado
                            return oBackendService.getAportesSegSocial(oData.d.Pernr)
                                .then(function (aAportesSegSocial) {
                                    oGlobalDataModel.setProperty("/aportesSegSocial", aAportesSegSocial);
                                })
                                .catch(function (oError) {
                                    console.error("Error al consultar los aportes de seguridad social:", oError);
                                });
                        })
                        .catch(function (oError) {
                            console.error("Error al consultar los datos del empleado:", oError);
                        });
                })
                .catch(function (oError) {
                    console.error("Error al obtener el usuario logueado:", oError);
                });
        },

        /**
         * Obtiene los datos del usuario logueado (id/email/fullName), sin importar por cuál puerta
         * entró a la app:
         * - Si corre dentro de Work Zone / Fiori Launchpad (existe sap.ushell.Container), usa el
         *   servicio "UserInfo" del ushell, igual que antes.
         * - Si corre detrás del App Router standalone con SSO directo vía IAS (sin Work Zone, por lo
         *   tanto sin sap.ushell.Container disponible), consulta el endpoint que expone el propio
         *   Application Router con la identidad ya autenticada por XSUAA/IAS.
         * En ambos casos se devuelve el mismo shape {id, email, fullName}, así el resto de la app
         * (BackendService.GetDataEmployee, etc., que identifica al empleado por su correo) sigue
         * funcionando exactamente igual sin más cambios.
         * @returns {Promise<{id: string, email: string, fullName: string}>}
         * @private
         */
        _getLoggedUserData: function () {
            // --- Código original (lectura de usuario vía Work Zone / Fiori Launchpad) --------------
            // Se deja comentado como referencia; la misma lógica se reutiliza tal cual, solo envuelta
            // en una Promise, en la rama "if (sap.ushell && sap.ushell.Container)" un poco más abajo.
            //
            // var oUserData = { id: "", email: "", fullName: "" };
            // if (sap.ushell && sap.ushell.Container) {
            //     var oUserInfo = sap.ushell.Container.getService("UserInfo");
            //     oUserData.id       = oUserInfo.getId()       || "";
            //     oUserData.email    = oUserInfo.getEmail()    || "";
            //     oUserData.fullName = oUserInfo.getFullName() || "";
            // }
            // -----------------------------------------------------------------------------------------

            if (sap.ushell && sap.ushell.Container) {
                // Sigue funcionando igual que antes cuando la app se abre desde Work Zone / Fiori Launchpad
                var oUserInfo = sap.ushell.Container.getService("UserInfo");
                return Promise.resolve({
                    id: oUserInfo.getId() || "",
                    email: oUserInfo.getEmail() || "",
                    fullName: oUserInfo.getFullName() || ""
                });
            }

            // NUEVO: acceso directo vía App Router standalone (SSO IAS/XSUAA, sin pasar por Work Zone)
            return this._getCurrentUserFromApprouter();
        },

        /**
         * Consulta "/user-api/currentUser", endpoint que expone @sap/approuter con los datos del
         * usuario ya autenticado (ruta a nivel raíz del App Router, protegida con authenticationType
         * "xsuaa" — ver approuter/xs-app.json), y arma el mismo shape {id, email, fullName} que antes
         * entregaba sap.ushell UserInfo.
         *
         * IMPORTANTE (pendiente de validar en el primer despliegue real): el nombre exacto del/los
         * campo(s) con el correo dentro de la respuesta depende del atributo que se mapee en la
         * Application de IAS (Paso 4 del documento de arquitectura: mail / uid / personIdExternal) y
         * de cómo XSUAA lo exponga en el JWT. Aquí se prueban varias claves conocidas (email/mail,
         * name/given_name/family_name) como fallback; conviene abrir "/user-api/currentUser"
         * directamente en el navegador tras el deploy para confirmar el shape real y, si el correo
         * viene con otro nombre de campo, ajustarlo aquí.
         * @returns {Promise<{id: string, email: string, fullName: string}>}
         * @private
         */
        _getCurrentUserFromApprouter: function () {
            return new Promise(function (resolve) {
                var xhr = new XMLHttpRequest();
                xhr.open("GET", "/user-api/currentUser", true);
                xhr.setRequestHeader("Accept", "application/json");

                xhr.onload = function () {
                    var oUserData = { id: "", email: "", fullName: "" };

                    if (xhr.status >= 200 && xhr.status < 300) {
                        try {
                            var oCurrentUser = xhr.responseText ? JSON.parse(xhr.responseText) : {};

                            var sEmail = oCurrentUser.email || oCurrentUser.mail || "";
                            var sFullName = oCurrentUser.name || [
                                oCurrentUser.firstname || oCurrentUser.given_name,
                                oCurrentUser.lastname || oCurrentUser.family_name
                            ].filter(Boolean).join(" ");

                            oUserData.id = oCurrentUser.logonName || oCurrentUser.name || sEmail || "";
                            oUserData.email = sEmail;
                            oUserData.fullName = sFullName;
                        } catch (e) {
                            console.error("No fue posible interpretar la respuesta de /user-api/currentUser:", e);
                        }
                    } else {
                        console.error("No fue posible obtener el usuario logueado desde el App Router:", xhr.status, xhr.statusText);
                    }

                    resolve(oUserData);
                };

                xhr.onerror = function () {
                    console.error("Error de red al consultar /user-api/currentUser");
                    resolve({ id: "", email: "", fullName: "" });
                };

                xhr.send();
            });
        }
    });
});
