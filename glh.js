
var glh = (function (glh) {
	'use strict';

	// Vertex formats

	glh.packNormalizedUnsignedBytes = function(x, y, z, w)
	{
		var buffer = new ArrayBuffer(4);
		var u8 = new Uint8Array(buffer);

		u8[0] = Math.min(Math.max(x * 255.0, 0.0), 255.0);
		u8[1] = Math.min(Math.max(y * 255.0, 0.0), 255.0);
		u8[2] = Math.min(Math.max(z * 255.0, 0.0), 255.0);
		u8[3] = Math.min(Math.max(w * 255.0, 0.0), 255.0);

		return new Uint32Array(buffer)[0];
	};

	var attributeSizeTable = null;

	glh.VertexFormat = function(gl, attributes)
	{
		if (!attributeSizeTable) {
			var t = { };
			t[gl.BYTE] = 1;
			t[gl.UNSIGNED_BYTE] = 1;
			t[gl.SHORT] = 2;
			t[gl.UNSIGNED_SHORT] = 2;
			t[gl.FLOAT] = 4;
			t[gl.FIXED] = 4;
			attributeSizeTable = t;
		}

		var size = 0;
		for (var i = 0; i < attributes.length; i++) {
			var a = attributes[i];
			size += a[1] * attributeSizeTable[a[2]];
		}

		var offset = 0;
		var attribs = { };
		for (var i = 0; i < attributes.length; i++) {
			var a = attributes[i];
			offset += a[1] * attributeSizeTable[a[2]];

			attribs[a[0]] = [
				a[1], a[2],
				a.length > 3 ? a[3] : gl.FALSE,
				size,
				offset,
			];
		}

		this.attributes = attribs;
		this.size = size;
	};

	// Shaders

	glh.compileShader = function(gl, source)
	{
		var shader = gl.createShader(type);
		gl.shaderSource(shader, source);
		gl.compileShader(shader);

		if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
			console.error(gl.getShaderInfoLog(shader));
		}

		return shader;
	};

	glh.linkProgram = function(gl, vertexShader, fragmentShader)
	{
		var program = gl.createProgram();
		gl.attachShader(program, vertexShader);
		gl.attachShader(program, fragmentShader);
		gl.linkProgram(program);

		if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
			console.error(gl.getProgramInfoLog(program));
		}

		return program;
	};

	var uniformSetterTable = { };

	function uniformMatrixWrapper(loc, value)
	{
		return function(loc, value) {
			func(loc, false, value);
		};
	}

	glh.Shader = function(gl, vertexShaderSrc, fragmentShaderSrc)
	{
		if (!uniformSetterTable) {
			var t = { };
			t[gl.FLOAT] = gl.uniform1fv;
			t[gl.FLOAT_VEC2] = gl.uniform2fv;
			t[gl.FLOAT_VEC3] = gl.uniform3fv;
			t[gl.FLOAT_VEC4] = gl.uniform4fv;
			t[gl.INT] = gl.uniform1iv;
			t[gl.INT_VEC2] = gl.uniform2iv;
			t[gl.INT_VEC3] = gl.uniform3iv;
			t[gl.INT_VEC4] = gl.uniform4iv;
			t[gl.BOOL] = gl.uniform1iv;
			t[gl.BOOL_VEC2] = gl.uniform2iv;
			t[gl.BOOL_VEC3] = gl.uniform3iv;
			t[gl.BOOL_VEC4] = gl.uniform4iv;
			t[gl.SAMPLER_2D] = gl.uniform1iv;
			t[gl.SAMPLER_CUBE] = gl.uniform1iv;
			t[gl.FLOAT_MAT2] = uniformMatrixWrapper(gl.uniformMatrix2fv);
			t[gl.FLOAT_MAT3] = uniformMatrixWrapper(gl.uniformMatrix3fv);
			t[gl.FLOAT_MAT4] = uniformMatrixWrapper(gl.uniformMatrix4fv);
			uniformSetterTable = t;
		}

		this.gl = gl;
		this.vertexShader = compileShader(gl, vertexShaderSrc);
		this.fragmentShader = compileShader(gl, fragmentShaderSrc);
		this.program = linkProgram(gl, this.vertexShader, this.fragmentShader);

		this.attributes = { };
		this.uniforms = { };

		var numUniforms = gl.getProgramiv(this.program, gl.ACTIVE_UNIFORMS);
		for (var i = 0; i < numUniforms; i++) {
			var uniform = gl.getActiveUniform(this.program, i);
			var index = gl.getUniformLocation(this.program, uniform.name);

			this.uniforms[uniform.name] = {
				index: index,
				type: uniform.type,
				size: uniform.size,
				setter: uniformSetterTable[uniform.type],
			};
		}

		var numAttribs = gl.getProgramiv(this.program, gl.ACTIVE_ATTRIBUTES);
		for (var i = 0; i < numAttribs; i++) {
			var attrib = gl.getActiveAttrib(this.program, i);
			this.attributes[attrib.name] = {
				index: gl.getAttribLocation(this.program, attrib.name),
				type: attrib.type,
				size: attrib.size,
			};
		}
	};

	glh.Shader.prototype.setUniforms = function(values)
	{
		for (var name in values) {
			var uniform = this.uniforms[name];
			if (!uniform) {
				console.error("Trying to set non-existent uniform " + uniform);
				continue;
			}

			uniform.setter(uniform.index, values[name]);
		}
	};

	glh.Shader.prototype.apply = function(vertexFormat)
	{
		var gl = this.gl;
		var attribs = vertexFormat.attributes;

		gl.useProgram(this.program);

		for (var attr in this.attributes) {
			var a = attribs[attr];
			var index = this.attributes[attr].index;

			if (!a) {
				console.error("Attribute " + attr + " not found in vertex format: ", vertexFormat);
				continue;
			}

			gl.enableVertexAttribArray(index);
			gl.vertexAttribPointer(index, a[0], a[1], a[2], a[3], a[4], a[5]);
		}
	};

	glh.Shader.prototype.destroy = function()
	{
		var gl = this.gl;
		gl.deleteProgram(this.program);
		gl.deleteShader(this.vertexShader);
		gl.deleteShader(this.fragmentShader);

		this.gl = null;
		this.program = null;
		this.vertexShader = null;
		this.fragmentShader = null;
	};

	// Texture

	glh.NEAREST = 1;
	glh.BILINEAR = 2;
	glh.TRILINEAR = 3;

	var filterOptions = {
		1: {
			mag: gl.NEAREST,
			min: gl.NEAREST,
		},
		2: {
			mag: gl.LINAER,
			min: gl.LINAER_MIPMAP_NEAREST,
		},
		3: {
			mag: gl.LINAER,
			min: gl.LINAER_MIPMAP_LINEAR,
		},
	};

	glh.createImageTexture = function(gl, image, filtering)
	{
		if (filtering === undefined)
			filtering = TRILINEAR;

		var texture = gl.createTexture();
		gl.bindTexture(gl.TEXTURE_2D, texture);
		gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, gl.RGBA, gl.UNSIGNED_BYTE, image);

		var options = filterOptions[filtering];
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, options.mag);
		gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, options.min);

		gl.generateMipmap(gl.TEXTURE_2D);

		gl.bindTexture(gl.TEXTURE_2D, null);

		return texture;
	};

	return glh;

})(glh || { });

